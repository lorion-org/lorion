import assert from 'node:assert/strict';
import console from 'node:console';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { resolveSelectedCapabilities } from '@lorion-org/capability-composition';
import { selectDescriptorsWithProviders } from '@lorion-org/descriptor-selection';
import {
  listRuntimeConfigScopeFiles,
  readRequiredJsonFile,
  writeJsonFile,
} from '@lorion-org/runtime-config-node';

const expectedRuntime = process.argv[2];
assert.ok(
  expectedRuntime === 'node' || expectedRuntime === 'bun',
  'Usage: check-package-runtime.mjs <node|bun>',
);
const actualRuntime = process.versions.bun ? 'bun' : 'node';
assert.equal(
  actualRuntime,
  expectedRuntime,
  `The ${expectedRuntime} compatibility check executed with ${actualRuntime}.`,
);

const require = createRequire(import.meta.url);
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

function packageSpecifier(packageName, subpath) {
  return subpath === '.' ? packageName : `${packageName}${subpath.slice(1)}`;
}

function hasRequireCondition(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (Object.hasOwn(value, 'require')) return true;
  return Object.values(value).some(hasRequireCondition);
}

let esmEntryPoints = 0;
let commonJsEntryPoints = 0;

for (const directory of readdirSync(join(repositoryRoot, 'packages')).sort()) {
  const manifest = JSON.parse(
    readFileSync(join(repositoryRoot, 'packages', directory, 'package.json'), 'utf8'),
  );

  for (const [subpath, conditions] of Object.entries(manifest.exports ?? {})) {
    assert.ok(
      !subpath.includes('*'),
      `${manifest.name} has an unverified pattern export: ${subpath}`,
    );
    const specifier = packageSpecifier(manifest.name, subpath);
    const resolved = import.meta.resolve(specifier);
    assert.match(resolved, /\/dist\//, `${specifier} did not resolve to published package output`);
    await import(specifier);
    esmEntryPoints += 1;

    if (hasRequireCondition(conditions)) {
      require(specifier);
      commonJsEntryPoints += 1;
    }
  }
}

const descriptor = (id, version, dependencies) => ({
  id,
  version,
  ...(dependencies ? { dependencies } : {}),
});
const select = (items) =>
  selectDescriptorsWithProviders({
    items,
    getDescriptor: (item) => item,
    withDescriptor: (_item, selected) => selected,
    seed: { selected: ['app'], selectionSeed: false },
  });

assert.equal(
  select([
    descriptor('app', '1.0.0', { feature: '^1.0.0' }),
    descriptor('feature', '1.2.0'),
    descriptor('feature', '1.10.0'),
    descriptor('feature', '2.0.0'),
  ]).items.find(({ id }) => id === 'feature')?.version,
  '1.10.0',
);
assert.equal(
  select([
    descriptor('app', '1.0.0', { feature: '^1.1.0-beta.1' }),
    descriptor('feature', '1.1.0-beta.2'),
  ]).items.find(({ id }) => id === 'feature')?.version,
  '1.1.0-beta.2',
);
assert.throws(
  () =>
    select([
      descriptor('app', '1.0.0', { alpha: '*', beta: '*' }),
      descriptor('alpha', '1.0.0', { shared: '^1.0.0' }),
      descriptor('beta', '1.0.0', { shared: '^2.0.0' }),
      descriptor('shared', '1.0.0'),
      descriptor('shared', '2.0.0'),
    ]),
  /No compatible version for "shared"/,
);

const tempRoot = mkdtempSync(join(tmpdir(), 'lorion-bun-'));

try {
  writeFileSync(
    join(tempRoot, 'package.json'),
    JSON.stringify({ private: true, workspaces: ['capabilities/*'] }),
  );

  for (const [directory, capability] of [
    ['app', descriptor('app', '1.0.0', { feature: '^1.0.0' })],
    ['feature-old', descriptor('feature', '1.2.0')],
    ['feature-new', descriptor('feature', '1.10.0')],
  ]) {
    const capabilityDir = join(tempRoot, 'capabilities', directory);
    mkdirSync(capabilityDir, { recursive: true });
    writeFileSync(join(capabilityDir, 'capability.json'), JSON.stringify(capability));
    writeFileSync(
      join(capabilityDir, 'package.json'),
      JSON.stringify({ name: `@acme/${directory}`, private: true }),
    );
  }

  const selected = resolveSelectedCapabilities({
    workspaceRoot: tempRoot,
    seed: { selected: ['app'], selectionSeed: false },
  });
  assert.deepEqual(
    selected.map(({ descriptor: selectedDescriptor }) => [
      selectedDescriptor.id,
      selectedDescriptor.version,
    ]),
    [
      ['app', '1.0.0'],
      ['feature', '1.10.0'],
    ],
  );

  const docsDir = join(tempRoot, 'runtime-config', 'billing', 'docs');
  mkdirSync(docsDir, { recursive: true });
  writeFileSync(join(docsDir, 'schema.json'), '{}');
  writeFileSync(join(docsDir, 'guide.md'), '# Guide');
  assert.deepEqual(listRuntimeConfigScopeFiles(tempRoot, 'billing', 'docs'), [
    'guide.md',
    'schema.json',
  ]);
  assert.deepEqual(
    listRuntimeConfigScopeFiles(tempRoot, 'billing', 'docs', { extension: '.json' }),
    ['schema.json'],
  );

  const dataPath = join(tempRoot, 'runtime-config', 'billing', 'data.json');
  writeJsonFile(dataPath, { public: { apiBase: '/api/billing' } });
  assert.deepEqual(readRequiredJsonFile(dataPath), { public: { apiBase: '/api/billing' } });
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log(
  `${actualRuntime} ${process.versions.bun ?? process.versions.node}: checked ${esmEntryPoints} ESM entry points, ${commonJsEntryPoints} CommonJS entry points, composition, version selection, and runtime-config file access.`,
);
