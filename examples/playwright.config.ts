import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
const profile = process.env.LORION_EXAMPLE_PROFILE ?? 'actions';
const seeds: Record<string, [string, string]> = {
  normal: ['storefront,shop-coffee', 'default,shop-coffee'],
  actions: [
    'storefront,shop-coffee,gift-wrap,order-note',
    'default,shop-coffee,gift-wrap,order-note',
  ],
  legacy: ['storefront-legacy', 'storefront-legacy'],
  inactive: ['gift-wrap', 'gift-wrap'],
  'legacy-cli': ['storefront,shop-coffee@1', 'default,shop-coffee@1'],
  beta: ['storefront,shop-coffee@beta', 'default,shop-coffee@beta'],
  'beta-compatible': [
    'storefront,shop-coffee@beta,shop-coffee@^2.0.0-beta.0',
    'default,shop-coffee@beta,shop-coffee@^2.0.0-beta.0',
  ],
  'beta-cli': ['storefront,shop-coffee@next', 'default,shop-coffee@next'],
  curated: ['storefront,shop-coffee@curated', 'default,shop-coffee@curated'],
  'curated-compatible': [
    'storefront,shop-coffee@curated,shop-coffee@1',
    'default,shop-coffee@curated,shop-coffee@1',
  ],
  'provider-only': ['payment-provider-stripe', 'payment-provider-stripe'],
  invoice: [
    'storefront,shop-coffee,payment-provider-invoice',
    'default,shop-coffee,payment-provider-invoice',
  ],
  'failure-duplicate': [
    'storefront,shop-coffee,failure-duplicate',
    'default,shop-coffee,failure-duplicate',
  ],
  'failure-factory': [
    'storefront,shop-coffee,failure-factory',
    'default,shop-coffee,failure-factory',
  ],
};
const seed = seeds[profile];
if (!seed) throw new Error(`Unknown contribution example profile: ${profile}`);
const cli = profile.endsWith('-cli');
const selectorProfile = [
  'beta',
  'beta-compatible',
  'beta-cli',
  'curated',
  'curated-compatible',
].includes(profile);
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: { browserName: 'chromium' },
  projects: [
    { name: 'react', use: { baseURL: 'http://127.0.0.1:4320' } },
    { name: 'nuxt', use: { baseURL: 'http://127.0.0.1:4321' } },
    ...(selectorProfile
      ? [
          {
            name: 'react-loader',
            testMatch: 'version-selection.spec.ts',
            use: { baseURL: 'http://127.0.0.1:4322' },
          },
        ]
      : []),
  ],
  webServer: [
    ...(selectorProfile
      ? [
          {
            command: cli
              ? `pnpm build:dist --features=${seed[0]} && pnpm serve:dist`
              : 'pnpm build:dist && pnpm serve:dist',
            cwd: resolve(import.meta.dirname, 'react-loader'),
            url: 'http://127.0.0.1:4322/tech',
            timeout: 180_000,
            env: {
              ...(cli ? { LORION_FEATURES: '' } : { LORION_FEATURES: seed[0] }),
              LORION_EXAMPLE_PROFILE: profile,
            },
            reuseExistingServer: false,
          },
        ]
      : []),
    {
      command: cli
        ? `pnpm build:dist --features=${seed[0]} && pnpm serve:dist`
        : 'pnpm build:dist && pnpm serve:dist',
      cwd: resolve(import.meta.dirname, 'react-runtime'),
      url: 'http://127.0.0.1:4320/tech',
      timeout: 180_000,
      env: {
        ...(cli ? { LORION_FEATURES: '' } : { LORION_FEATURES: seed[0] }),
        LORION_EXAMPLE_PROFILE: profile,
      },
      reuseExistingServer: false,
    },
    {
      command: cli
        ? `pnpm build:dist --capabilities=${seed[1]} && pnpm serve:dist`
        : 'pnpm build:dist && pnpm serve:dist',
      cwd: resolve(import.meta.dirname, 'nuxt'),
      url: `http://127.0.0.1:4321/${profile.startsWith('failure-') ? '__contribution-health' : 'tech'}`,
      timeout: 180_000,
      env: {
        ...(cli ? { LORION_CAPABILITIES: '' } : { LORION_CAPABILITIES: seed[1] }),
        LORION_EXAMPLE_PROFILE: profile,
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: '4321',
      },
      reuseExistingServer: false,
    },
  ],
});
