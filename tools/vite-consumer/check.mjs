import assert from 'node:assert/strict';
import console from 'node:console';
import { Buffer } from 'node:buffer';
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const repository = resolve(import.meta.dirname, '../..');
const reactPackage = join(repository, 'packages/react');
const runtime = process.versions.bun ? 'Bun' : 'Node';
assert.equal(process.argv[2], runtime.toLowerCase(), 'Pass the expected runtime: node or bun.');

function write(root, path, content) {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, typeof content === 'string' ? content : JSON.stringify(content));
}

function fixture(major) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), `lorion-vite${major}-`)));
  const modules = join(root, 'node_modules');
  const consumerPackage = join(modules, '@lorion-org/react');
  mkdirSync(consumerPackage, { recursive: true });
  // Copy this package so its optional Vite peer resolves in the consumer, not
  // back through the workspace package's Vite 7 development dependency.
  cpSync(join(reactPackage, 'dist'), join(consumerPackage, 'dist'), { recursive: true });
  cpSync(join(reactPackage, 'package.json'), join(consumerPackage, 'package.json'));
  const manifest = JSON.parse(readFileSync(join(reactPackage, 'package.json'), 'utf8'));
  for (const name of Object.keys(manifest.dependencies)) {
    symlinkSync(
      join(repository, 'packages', name.slice('@lorion-org/'.length)),
      join(modules, name),
      'junction',
    );
  }
  symlinkSync(join(reactPackage, 'node_modules/react'), join(modules, 'react'), 'junction');
  const viteDirectory = dirname(require.resolve(`vite${major}/package.json`));
  symlinkSync(viteDirectory, join(modules, 'vite'), 'junction');
  write(root, 'package.json', { private: true, type: 'module' });
  write(
    root,
    'esm.mjs',
    `export * from '@lorion-org/react/vite';\nexport { version } from 'vite';\nexport const vitePath = import.meta.resolve('vite');\n`,
  );
  write(root, 'capabilities/sample/package.json', {
    name: '@fixture/sample',
    type: 'module',
    exports: { './capability': './entry.js' },
  });
  write(root, 'capabilities/sample/capability.json', { id: 'sample', version: '2.0.0' });
  write(
    root,
    'capabilities/sample/entry.js',
    `export const capability = { id: 'sample', value: 'activated' };\n`,
  );
  write(root, 'capabilities/sample/capability.schema.json', {
    type: 'object',
    properties: {
      public: { type: 'object', properties: { label: { type: 'string' } } },
      private: { type: 'object', properties: { token: { type: 'string' } } },
    },
  });
  write(root, '.env.acceptance', 'VITE_SAMPLE_LABEL=wrong-directory\n');
  write(root, 'env/.env', 'VITE_SAMPLE_LABEL=base-value\nSAMPLE_TOKEN=fixture-private-token\n');
  write(root, 'env/.env.acceptance', 'VITE_SAMPLE_LABEL=mode-value\n');
  write(
    root,
    'client.js',
    `
import { capabilityModules, resolvedCapabilityIds, resolvedCapabilityVersions } from 'virtual:capabilities';
import { capabilityRuntimeConfig } from 'virtual:capability-runtime-config';
export default { capabilityModules, resolvedCapabilityIds, resolvedCapabilityVersions, capabilityRuntimeConfig };
`,
  );
  write(
    root,
    'server.js',
    `
export { default } from './client.js';
export { capabilityServerRuntimeConfig } from 'virtual:capability-runtime-config/server';
`,
  );
  write(root, 'private-client.js', `export * from 'virtual:capability-runtime-config/server';\n`);
  return { root, viteDirectory };
}

function assertResult(result, publicConfig) {
  assert.deepEqual(result.resolvedCapabilityIds, ['sample']);
  assert.deepEqual(result.resolvedCapabilityVersions, { sample: '2.0.0' });
  assert.deepEqual(result.capabilityModules, [{ id: 'sample', value: 'activated' }]);
  assert.deepEqual(result.capabilityRuntimeConfig, {
    public: publicConfig,
  });
}

for (const major of [7, 8]) {
  const { root, viteDirectory } = fixture(major);
  try {
    const esm = await import(pathToFileURL(join(root, 'esm.mjs')).href);
    const consumerRequire = createRequire(join(root, 'consumer.cjs'));
    const commonjs = consumerRequire('@lorion-org/react/vite');
    const vite = await import(pathToFileURL(join(viteDirectory, 'dist/node/index.js')).href);
    assert.equal(Number(esm.version.split('.')[0]), major);
    assert.equal(esm.version, vite.version);
    assert.equal(fileURLToPath(esm.vitePath), consumerRequire.resolve('vite'));
    assert.equal(consumerRequire.resolve('vite'), join(viteDirectory, 'dist/node/index.js'));
    assert.equal(
      consumerRequire.resolve('@lorion-org/react/vite'),
      realpathSync(join(root, 'node_modules/@lorion-org/react/dist/vite.cjs')),
    );

    for (const [branch, entry] of [
      ['ESM', esm],
      ['CommonJS', commonjs],
    ]) {
      for (const model of ['loader', 'routes']) {
        for (const { enabled, envDir } of [
          { enabled: false, envDir: join(root, 'env') },
          { enabled: true, envDir: join(root, 'env') },
          { enabled: true, envDir: false },
        ]) {
          const publicConfig =
            enabled && envDir !== false ? { sample: { label: 'mode-value' } } : {};
          const options = {
            workspaceRoot: root,
            selected: ['sample'],
            selectionSeed: false,
            runtimeConfig: enabled ? { source: false } : false,
          };
          const config = () => ({
            configFile: false,
            root,
            mode: 'acceptance',
            envDir,
            logLevel: 'silent',
            plugins: [
              model === 'loader'
                ? entry.capabilityLoader(options)
                : entry.lorionReact({ ...options, routesDirectory: join(root, 'routes') })
                    .capabilityLoader,
            ],
          });
          const server = await vite.createServer({
            ...config(),
            server: { middlewareMode: true, watch: null },
          });
          try {
            const transformed = await server.transformRequest('/client.js');
            assert.ok(transformed?.code.includes('virtual:capabilities'));
            const transformedConfig = await server.transformRequest(
              'virtual:capability-runtime-config',
            );
            assert.ok(transformedConfig);
            assert.ok(!transformedConfig.code.includes('fixture-private-token'));
            const loaded = await server.ssrLoadModule('/server.js');
            assertResult(loaded.default, publicConfig);
            assert.deepEqual(loaded.capabilityServerRuntimeConfig, {
              public: publicConfig,
              private:
                enabled && envDir !== false ? { sample: { token: 'fixture-private-token' } } : {},
            });
          } finally {
            await server.close();
          }
          const built = await vite.build({
            ...config(),
            build: {
              write: false,
              minify: false,
              lib: { entry: join(root, 'client.js'), formats: ['es'] },
            },
          });
          const chunks = (Array.isArray(built) ? built : [built]).flatMap(
            (result) => result.output,
          );
          const chunk = chunks.find((output) => output.type === 'chunk' && output.isEntry);
          assert.ok(chunk);
          assert.deepEqual(chunk.imports, []);
          assert.ok(!chunk.code.includes('fixture-private-token'));
          const output = await import(
            `data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`
          );
          assertResult(output.default, publicConfig);
          await assert.rejects(
            () =>
              vite.build({
                ...config(),
                build: {
                  write: false,
                  lib: { entry: join(root, 'private-client.js'), formats: ['es'] },
                },
              }),
            /may only be imported from SSR\/server code/,
          );
          console.log(
            `${runtime}: Vite ${vite.version}, ${branch}, ${model}, runtimeConfig ${enabled ? 'enabled' : 'disabled'}, env files ${envDir === false ? 'disabled' : 'enabled'}: dev, SSR, build and client privacy passed.`,
          );
        }
      }
    }
    if (process.versions.bun) {
      write(
        root,
        'bundle-entry.mjs',
        `
import { capabilityLoader } from '@lorion-org/react/vite';
const plugin = capabilityLoader({ workspaceRoot: ${JSON.stringify(root)}, selected: ['sample'], selectionSeed: false, runtimeConfig: false });
plugin.configResolved({ root: ${JSON.stringify(root)} });
if (!plugin.load(plugin.resolveId('virtual:capabilities')).includes('sample')) throw new Error('Missing capability');
`,
      );
      const bundled = await globalThis.Bun.build({
        entrypoints: [join(root, 'bundle-entry.mjs')],
        target: 'bun',
        outdir: join(root, 'bundled'),
        external: ['vite'],
      });
      assert.ok(bundled.success, bundled.logs.map(String).join('\n'));
      const execution = spawnSync(process.execPath, [bundled.outputs[0].path], {
        encoding: 'utf8',
      });
      assert.equal(execution.status, 0, execution.stderr);
      console.log(
        `Bun: Vite ${vite.version}, server bundle with the Vite build tool externalized passed.`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
