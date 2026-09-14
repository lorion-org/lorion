import assert from 'node:assert/strict';
import console from 'node:console';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

for (const profile of [
  'normal',
  'actions',
  'legacy',
  'inactive',
  'invoice',
  'legacy-cli',
  'provider-only',
  'failure-duplicate',
  'failure-factory',
]) {
  const result = spawnSync(
    'pnpm',
    ['exec', 'playwright', 'test', '--config', 'examples/playwright.config.ts'],
    {
      stdio: 'inherit',
      env: { ...process.env, LORION_EXAMPLE_PROFILE: profile },
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

for (const input of ['environment', 'CLI']) {
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      '@lorion-examples/nuxt',
      'build:dist',
      ...(input === 'CLI' ? ['--capabilities=storefront-conflict'] : []),
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        LORION_EXAMPLE_PROFILE: 'normal',
        LORION_CAPABILITIES: input === 'environment' ? 'storefront-conflict' : '',
      },
    },
  );
  if (result.error) throw result.error;
  assert.notEqual(result.status, 0, `${input} must reject incompatible selected versions.`);
  const output = result.stdout + result.stderr;
  assert.match(output, /storefront-conflict@1\.0\.0 requires shop-coffee@2/);
  assert.match(output, /storefront-legacy@1\.0\.0 requires shop-coffee@1/);
  console.log(`Nuxt ${input} selection rejected conflicting version requirements.`);
}
