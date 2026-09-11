import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { URL } from 'node:url';
import { checkDeclarations } from './check-declarations.mjs';
import { runApiReports } from './api-reports.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'lorion-api-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const write = (path, value) => {
    const full = join(root, path);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  };
  write(
    'api-extractor.json',
    readFileSync(new URL('../api-extractor.json', import.meta.url), 'utf8'),
  );
  const manifest = {
    name: '@lorion-org/runtime',
    dependencies: { '@lorion-org/model': '1.0.0' },
    version: '1.0.0',
    type: 'module',
    exports: {
      '.': {
        'lorion-source': { types: './src/index.ts', default: './src/index.ts' },
        import: { types: './dist/index.d.ts', default: './dist/index.js' },
        require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
      },
      './extra': { types: './dist/extra.d.ts', default: './dist/extra.js' },
    },
  };
  const declarations =
    "export interface Options { optional?: string; mode: 'alpha' | 'beta' }\nexport declare function run(options: Options): string;\nexport * from './shared.js';\nexport { Model } from '@lorion-org/model';\n";
  write('packages/runtime/package.json', manifest);
  write('packages/runtime/dist/index.d.ts', declarations);
  write('packages/runtime/dist/index.d.cts', declarations);
  write('packages/runtime/dist/shared.d.ts', 'export interface Shared { value: number }');
  write('packages/runtime/dist/extra.d.ts', 'export declare const extra: number;');
  write('packages/runtime/dist/index.js', 'export function run() { return "before"; }');
  write('packages/runtime/src/index.ts', 'export const sourceOnly = 1;');
  write('packages/model/package.json', {
    name: '@lorion-org/model',
    version: '1.0.0',
    type: 'module',
    exports: { '.': { types: './dist/index.d.ts' } },
  });
  write('packages/model/dist/index.d.ts', 'export interface Model { value: number }');
  mkdirSync(join(root, 'node_modules/@lorion-org'), { recursive: true });
  symlinkSync(join(root, 'packages/model'), join(root, 'node_modules/@lorion-org/model'));
  return { root, write, manifest, declarations };
}

function reports(root) {
  return Object.fromEntries(
    readdirSync(join(root, 'api'))
      .filter((name) => name.endsWith('.api.md'))
      .sort()
      .map((name) => [name, readFileSync(join(root, 'api', name), 'utf8')]),
  );
}

const esmReport = 'runtime.index.import.types.api.md';
const cjsReport = 'runtime.index.require.types.api.md';
const extraReport = 'runtime.subpath-extra.types.api.md';

test('native reports cover each entry/condition and reachable workspace types', (t) => {
  const { root } = fixture(t);
  assert.equal(runApiReports(root, true), 4);
  const output = reports(root);
  assert.equal(Object.keys(output).length, 4);
  const text = output[esmReport];
  assert.match(text, /API Report File for "@lorion-org\/runtime"/);
  assert.match(text, /run\(options: Options\): string/);
  assert.match(text, /optional\?: string/);
  assert.match(text, /mode: 'alpha' \| 'beta'/);
  assert.match(text, /interface Shared/);
  assert.match(text, /interface Model/);
  assert.match(output[extraReport], /extra: number/);
  assert.equal(output[cjsReport], text);
  assert.doesNotMatch(text, /sourceOnly/);
  runApiReports(root);
});

const mutations = {
  'removed export': ({ write, declarations }) =>
    write(
      'packages/runtime/dist/index.d.ts',
      declarations.replace('export declare function run(options: Options): string;', ''),
    ),
  'optional field made required': ({ write, declarations }) =>
    write('packages/runtime/dist/index.d.ts', declarations.replace('optional?:', 'optional:')),
  'narrowed union': ({ write, declarations }) =>
    write('packages/runtime/dist/index.d.ts', declarations.replace("'alpha' | 'beta'", "'alpha'")),
  'changed parameter type': ({ write, declarations }) =>
    write(
      'packages/runtime/dist/index.d.ts',
      declarations.replace('run(options: Options)', 'run(options: number)'),
    ),
  'indirect wildcard export widened': ({ write }) =>
    write(
      'packages/runtime/dist/shared.d.ts',
      'export interface Shared { value: number }\nexport declare const added: boolean;',
    ),
  'reachable workspace type changed': ({ write }) =>
    write('packages/model/dist/index.d.ts', 'export interface Model { value: string }'),
  'CommonJS-only signature changed': ({ write, declarations }) =>
    write('packages/runtime/dist/index.d.cts', declarations.replace('): string;', '): number;')),
  'secondary entry point changed': ({ write }) =>
    write('packages/runtime/dist/extra.d.ts', 'export declare const extra: string;'),
  'entry point removed': ({ write, manifest }) => {
    delete manifest.exports['./extra'];
    write('packages/runtime/package.json', manifest);
  },
  'entry point added': ({ write, manifest }) => {
    manifest.exports['./new'] = { types: './dist/extra.d.ts' };
    write('packages/runtime/package.json', manifest);
  },
};

for (const [name, mutate] of Object.entries(mutations)) {
  test(`detects ${name} without rewriting the committed reports`, (t) => {
    const f = fixture(t);
    runApiReports(f.root, true);
    const before = reports(f.root);
    mutate(f);
    assert.throws(() => runApiReports(f.root), /API check failed|Obsolete API reports/);
    assert.deepEqual(reports(f.root), before);
    runApiReports(f.root, true);
    const after = reports(f.root);
    assert.notDeepEqual(after, before);
    if (name === 'reachable workspace type changed') {
      assert.notEqual(after[esmReport], before[esmReport]);
    }
    if (name === 'CommonJS-only signature changed') {
      assert.notEqual(after[cjsReport], before[cjsReport]);
      assert.equal(after[esmReport], before[esmReport]);
    }
    runApiReports(f.root);
  });
}

test('implementation changes and repeated generation leave native reports unchanged', (t) => {
  const f = fixture(t);
  runApiReports(f.root, true);
  const before = reports(f.root);
  f.write('packages/runtime/dist/index.js', 'export function run() { return "after"; }');
  f.write('packages/runtime/dist/unreachable.d.ts', 'interface Internal { changed: true }');
  runApiReports(f.root);
  runApiReports(f.root, true);
  assert.deepEqual(reports(f.root), before);
});

test('missing and obsolete reports fail check, then write reconciles the exact set', (t) => {
  const { root, write } = fixture(t);
  assert.throws(() => runApiReports(root), /API check failed/);
  runApiReports(root, true);
  write('api/removed.api.md', '# Old\n');
  write('api/README.md', 'Keep this file.');
  assert.throws(() => runApiReports(root), /Obsolete API reports: removed\.api\.md/);
  runApiReports(root, true);
  runApiReports(root);
  assert.equal(readFileSync(join(root, 'api/README.md'), 'utf8'), 'Keep this file.');
  rmSync(join(root, 'api', cjsReport));
  assert.throws(() => runApiReports(root), /API report file is missing/);
});

test('missing declarations and unsupported exports fail instead of producing partial reports', (t) => {
  const f = fixture(t);
  rmSync(join(f.root, 'packages/runtime/dist/extra.d.ts'));
  assert.throws(() => runApiReports(f.root), /path does not exist/);
  f.manifest.exports['./extra'] = { default: './dist/extra.js' };
  f.write('packages/runtime/package.json', f.manifest);
  assert.throws(() => runApiReports(f.root), /no published declaration target/);
  f.manifest.exports['./extra'] = { types: './src/extra.ts' };
  f.write('packages/runtime/package.json', f.manifest);
  assert.throws(() => runApiReports(f.root), /expected a dist declaration/);
  delete f.manifest.exports['./extra'];
  f.manifest.exports['./*'] = { types: './dist/*.d.ts' };
  f.write('packages/runtime/package.json', f.manifest);
  assert.throws(() => runApiReports(f.root), /unsupported export/);
  delete f.manifest.exports['./*'];
  f.manifest.exports['./extra'] = { browser: { types: './dist/extra.d.ts' } };
  f.write('packages/runtime/package.json', f.manifest);
  assert.throws(() => runApiReports(f.root), /unsupported export condition browser/);
});

test('retains overloads, generic constraints, aliases and reachable non-exported types', (t) => {
  const f = fixture(t);
  f.write(
    'packages/runtime/dist/extra.d.ts',
    `
interface Hidden { readonly value: number }
export declare function overloaded(value: string): Hidden;
export declare function overloaded(value: number): Hidden;
export declare function generic<T extends Hidden>(value: T): T;
export { generic as renamed };
export default overloaded;
`,
  );
  runApiReports(f.root, true);
  const report = reports(f.root)[extraReport];
  assert.match(report, /overloaded\(value: string\): Hidden/);
  assert.match(report, /overloaded\(value: number\): Hidden/);
  assert.match(report, /generic<T extends Hidden>/);
  assert.match(report, /generic as renamed/);
  assert.match(report, /readonly value: number/);
  assert.match(report, /export default overloaded/);
});

test('removing a public package makes its retained reports obsolete', (t) => {
  const f = fixture(t);
  runApiReports(f.root, true);
  rmSync(join(f.root, 'packages/runtime'), { recursive: true });
  assert.throws(() => runApiReports(f.root), /Obsolete API reports:.*runtime/);
  assert.equal(runApiReports(f.root, true), 1);
  runApiReports(f.root);
});

test('an unresolved local re-export fails analysis', (t) => {
  const f = fixture(t);
  runApiReports(f.root, true);
  f.write('packages/runtime/dist/extra.d.ts', "export { Missing } from './missing.js';");
  assert.throws(() => runApiReports(f.root), /Cannot find module '\.\/missing\.js'/);
});

test('native reports remain portable when bundled dependencies produce diagnostics', (t) => {
  const first = fixture(t);
  const second = fixture(t);
  for (const f of [first, second]) {
    f.write(
      'packages/model/dist/index.d.ts',
      `
      type HiddenId = string;
      export interface Model { value: HiddenId }
    `,
    );
  }
  runApiReports(first.root, true);
  const baseline = reports(first.root);
  assert.match(baseline[esmReport], /HiddenId/);
  for (const report of Object.values(baseline)) {
    assert.ok(!report.includes(first.root));
    // Unassociated dependency diagnostics can include absolute checkout paths.
    assert.doesNotMatch(report, /ae-forgotten-export/);
  }
  cpSync(join(first.root, 'api'), join(second.root, 'api'), { recursive: true });
  runApiReports(second.root);
  runApiReports(second.root, true);
  assert.deepEqual(reports(second.root), baseline);
});

test('uncovered runtime conditions fail even beside a typed sibling', (t) => {
  const f = fixture(t);
  runApiReports(f.root, true);
  const before = reports(f.root);
  for (const target of [
    './dist/index.cjs',
    { default: './dist/index.cjs' },
    { types: null, default: './dist/index.cjs' },
    { types: { import: './dist/index.d.ts' }, default: './dist/index.cjs' },
  ]) {
    f.manifest.exports['.'].require = target;
    f.write('packages/runtime/package.json', f.manifest);
    assert.throws(() => runApiReports(f.root), /no published declaration target/);
    assert.deepEqual(reports(f.root), before);
  }
});

test('shared types, nested type conditions and blocked entries have explicit coverage', (t) => {
  const f = fixture(t);
  f.write('packages/runtime/dist/extra.d.mts', 'export declare const extra: number;');
  f.manifest.exports['./extra'] = {
    types: './dist/extra.d.mts',
    import: './dist/extra.js',
    default: './dist/extra.js',
  };
  f.manifest.exports['./blocked'] = null;
  f.write('packages/runtime/package.json', f.manifest);
  runApiReports(f.root, true);
  runApiReports(f.root);
  f.manifest.exports['./extra'] = {
    types: { import: './dist/extra.d.mts', require: './dist/index.d.cts' },
  };
  f.write('packages/runtime/package.json', f.manifest);
  runApiReports(f.root, true);
  runApiReports(f.root);
  f.manifest.exports['./extra'] = { default: './dist/extra.js', types: './dist/extra.d.mts' };
  f.write('packages/runtime/package.json', f.manifest);
  assert.throws(() => runApiReports(f.root), /types must precede/);
});

function consumerProjects(f, esm, cjs = esm) {
  for (const [name, source] of [
    ['index.ts', esm],
    ['index.cts', cjs],
  ]) {
    f.write(`tools/dist-consumer/src/${name}`, source);
    f.write(
      `tools/dist-consumer/${name.endsWith('.cts') ? 'tsconfig.cjs.json' : 'tsconfig.json'}`,
      {
        compilerOptions: {
          strict: true,
          noEmit: true,
          skipLibCheck: false,
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
        },
        files: [`src/${name}`],
      },
    );
  }
  f.write('tools/dist-consumer/package.json', { type: 'module' });
  symlinkSync(join(f.root, 'packages/runtime'), join(f.root, 'node_modules/@lorion-org/runtime'));
}

test('published consumers reject value-to-type-only exports in both module branches', (t) => {
  const f = fixture(t);
  const declaration = 'declare class Registry { value: string } export { Registry };';
  for (const suffix of ['ts', 'cts'])
    f.write(`packages/runtime/dist/index.d.${suffix}`, declaration);
  consumerProjects(f, "import { Registry } from '@lorion-org/runtime'; new Registry();");
  runApiReports(f.root, true);
  checkDeclarations(f.root);
  for (const suffix of ['ts', 'cts']) {
    f.write(
      `packages/runtime/dist/index.d.${suffix}`,
      declaration.replace('export {', 'export type {'),
    );
    // API Extractor does not retain the value/type distinction; the consumer must.
    runApiReports(f.root);
    assert.throws(() => checkDeclarations(f.root), /cannot be used as a value/);
    f.write(`packages/runtime/dist/index.d.${suffix}`, declaration);
    checkDeclarations(f.root);
  }
});

test('published consumers reject lost and incompatible module augmentations', (t) => {
  const f = fixture(t);
  f.write('node_modules/host/package.json', {
    name: 'host',
    version: '1.0.0',
    types: './index.d.ts',
  });
  f.write('node_modules/host/index.d.ts', 'export interface Config { name?: string }');
  const augmentation = `import 'host';
    declare module 'host' { interface Config { lorion?: { logging?: boolean } } }
    export declare const value: number;`;
  f.write('packages/runtime/dist/index.d.ts', augmentation);
  consumerProjects(
    f,
    `import '@lorion-org/runtime';
    import type { Config } from 'host';
    export type Options = Config['lorion'];
    export const config: Pick<Config, 'lorion'> = { lorion: { logging: true } };
    export const empty: Pick<Config, 'lorion'> = {};`,
    'export {};',
  );
  runApiReports(f.root, true);
  checkDeclarations(f.root);
  for (const mutation of [
    "import 'host'; export declare const value: number;",
    augmentation.replace('lorion?:', 'lorion:'),
    augmentation.replace('logging?: boolean', 'logging?: string'),
  ]) {
    f.write('packages/runtime/dist/index.d.ts', mutation);
    runApiReports(f.root);
    assert.throws(() => checkDeclarations(f.root), /lorion|not assignable/);
    f.write('packages/runtime/dist/index.d.ts', augmentation);
    checkDeclarations(f.root);
  }
});

test('declaration checks report consumer and configuration errors', (t) => {
  const f = fixture(t);
  consumerProjects(
    f,
    "import type { Missing } from '@lorion-org/runtime'; export type Consumer = Missing;",
    'export {};',
  );
  assert.throws(() => checkDeclarations(f.root), /has no exported member 'Missing'/);
  f.write('tools/dist-consumer/src/index.ts', 'export {};');
  checkDeclarations(f.root);
  f.write('tools/dist-consumer/tsconfig.json', {
    compilerOptions: { unknownCompilerOption: true },
    files: ['src/index.ts'],
  });
  assert.throws(() => checkDeclarations(f.root), /Unknown compiler option/);
});
