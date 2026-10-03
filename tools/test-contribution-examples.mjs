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
  'beta',
  'beta-compatible',
  'beta-cli',
  'curated',
  'curated-compatible',
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

for (const [host, key, seed] of [
  ['react-loader', 'LORION_FEATURES', 'storefront-legacy,shop-coffee@beta'],
  ['react-runtime', 'LORION_FEATURES', 'storefront-legacy,shop-coffee@beta'],
  ['nuxt', 'LORION_CAPABILITIES', 'storefront-legacy,shop-coffee@beta'],
]) {
  const result = spawnSync('pnpm', ['--filter', `@lorion-examples/${host}`, 'build:dist'], {
    encoding: 'utf8',
    env: { ...process.env, [key]: seed },
  });
  if (result.error) throw result.error;
  assert.notEqual(
    result.status,
    0,
    `${host} must not escape the beta selector to a stable version.`,
  );
  assert.match(result.stdout + result.stderr, /shop-coffee/);
  assert.match(result.stdout + result.stderr, /requires shop-coffee@beta/);
  assert.match(result.stdout + result.stderr, /storefront-legacy@1\.0\.0 requires shop-coffee@1/);
  console.log(`${host} rejected a selector incompatible with an active dependency.`);
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
