import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';
const profile = process.env.LORION_EXAMPLE_PROFILE ?? 'actions';
const seeds: Record<string, [string, string]> = {
  normal: ['storefront', 'default'],
  actions: ['storefront,gift-wrap,order-note', 'default,gift-wrap,order-note'],
  legacy: ['storefront-legacy', 'storefront-legacy'],
  inactive: ['gift-wrap', 'gift-wrap'],
  'legacy-cli': ['storefront,shop-coffee@1', 'default,shop-coffee@1'],
  'provider-only': ['payment-provider-stripe', 'payment-provider-stripe'],
  invoice: ['storefront,payment-provider-invoice', 'default,payment-provider-invoice'],
  'failure-duplicate': ['storefront,failure-duplicate', 'default,failure-duplicate'],
  'failure-factory': ['storefront,failure-factory', 'default,failure-factory'],
};
const seed = seeds[profile];
if (!seed) throw new Error(`Unknown contribution example profile: ${profile}`);
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: { browserName: 'chromium' },
  projects: [
    { name: 'react', use: { baseURL: 'http://127.0.0.1:4320' } },
    { name: 'nuxt', use: { baseURL: 'http://127.0.0.1:4321' } },
  ],
  webServer: [
    {
      command:
        profile === 'legacy-cli'
          ? 'pnpm build:dist --features=storefront,shop-coffee@1 && pnpm serve:dist'
          : 'pnpm build:dist && pnpm serve:dist',
      cwd: resolve(import.meta.dirname, 'react-runtime'),
      url: 'http://127.0.0.1:4320/tech',
      timeout: 180_000,
      env: {
        ...(profile === 'legacy-cli' ? {} : { LORION_FEATURES: seed[0] }),
        LORION_EXAMPLE_PROFILE: profile,
      },
      reuseExistingServer: false,
    },
    {
      command:
        profile === 'legacy-cli'
          ? 'pnpm build:dist --capabilities=default,shop-coffee@1 && pnpm serve:dist'
          : 'pnpm build:dist && pnpm serve:dist',
      cwd: resolve(import.meta.dirname, 'nuxt'),
      url: `http://127.0.0.1:4321/${profile.startsWith('failure-') ? '__contribution-health' : 'tech'}`,
      timeout: 180_000,
      env: {
        ...(profile === 'legacy-cli' ? {} : { LORION_CAPABILITIES: seed[1] }),
        LORION_EXAMPLE_PROFILE: profile,
        NITRO_HOST: '127.0.0.1',
        NITRO_PORT: '4321',
      },
      reuseExistingServer: false,
    },
  ],
});
