import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { contributionModule as owner } from '@lorion-fixtures/contribution-owner/contributions';
import { createContributionRuntime } from '@lorion-org/contributions';

// Use the installed package's public type-only export to author a guest whose emitted
// module must also execute when no runtime export for that contract exists.
const source = readFileSync(
  new URL('./src/installed-contribution-contract.ts', import.meta.url),
  'utf8',
);
const output = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    verbatimModuleSyntax: true,
  },
}).outputText;
assert.ok(
  !output.includes('@lorion-fixtures/contribution-owner'),
  'Type-only owner import leaked into runtime output.',
);
const temp = mkdtempSync(join(import.meta.dirname, '.contract-check-'));
try {
  const path = join(temp, 'guest.mjs');
  writeFileSync(path, output);
  const { contributionModule: guest } = await import(pathToFileURL(path).href);
  const target = { owner: 'fixture-owner', point: 'actions' };
  const runtime = createContributionRuntime({
    plan: {
      selected: [
        { id: owner.id, version: owner.version },
        { id: guest.id, version: guest.version },
      ],
      points: [{ ...target, ownerVersion: owner.version }],
      edges: [
        {
          source: { id: guest.id, version: guest.version },
          target,
          active: true,
          ownerVersion: owner.version,
        },
      ],
    },
    modules: [owner, guest],
  });
  assert.equal(runtime.get(target)[0].value.label, 'Installed contract');
} finally {
  rmSync(temp, { recursive: true, force: true });
}

const consumerPath = fileURLToPath(
  new URL('./src/installed-contribution-contract.ts', import.meta.url),
);
const compilerOptions = {
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
};
const specifier = '@lorion-fixtures/contribution-owner/contracts';
assert.ok(
  ts.resolveModuleName(specifier, consumerPath, compilerOptions, ts.sys).resolvedModule,
  'The installed public contract export must resolve.',
);
const withoutContractExport = {
  ...ts.sys,
  readFile(path) {
    const content = ts.sys.readFile(path);
    if (
      !content ||
      !path.replaceAll('\\', '/').endsWith('/@lorion-fixtures/contribution-owner/package.json')
    )
      return content;
    const manifest = JSON.parse(content);
    delete manifest.exports['./contracts'];
    return JSON.stringify(manifest);
  },
};
assert.equal(
  ts.resolveModuleName(specifier, consumerPath, compilerOptions, withoutContractExport)
    .resolvedModule,
  undefined,
  'Removing the installed public export must invalidate contract resolution.',
);
