import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createNuxtExtensionBootstrap } from '../../src/extensions';
import lorionNuxtModule, {
  createConfiguredNuxtRuntimeConfig,
  createNuxtExtensionBootstrapLogEvent,
  formatNuxtExtensionBootstrapLog,
  reportNuxtExtensionBootstrap,
} from '../../src/module';

describe('LORION Nuxt module', () => {
  it('declares the public module metadata', async () => {
    await expect(lorionNuxtModule.getMeta?.()).resolves.toMatchObject({
      name: '@lorion-org/nuxt',
      configKey: 'lorion',
    });
  });

  it('does not create runtime config when the extension is not configured', () => {
    expect(createConfiguredNuxtRuntimeConfig({})).toBeUndefined();
    expect(
      createConfiguredNuxtRuntimeConfig({
        runtimeConfig: {
          enabled: false,
          fragments: {
            billing: {
              public: {
                apiBase: '/api/billing',
              },
            },
          },
        },
      }),
    ).toBeUndefined();
  });

  it('creates runtime config only for configured runtime config fragments', () => {
    expect(
      createConfiguredNuxtRuntimeConfig({
        runtimeConfig: {
          fragments: {
            billing: {
              public: {
                apiBase: '/api/billing',
              },
            },
          },
        },
      }),
    ).toEqual({
      public: {
        billingApiBase: '/api/billing',
      },
    });
  });

  it('does not call a reporter when bootstrap logging is omitted', () => {
    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: join(__dirname, '../fixtures/extensions'),
    });

    expect(() => reportNuxtExtensionBootstrap({ bootstrap })).not.toThrow();
    expect(() =>
      reportNuxtExtensionBootstrap({
        bootstrap,
        logging: true,
      }),
    ).not.toThrow();
  });

  it('creates a structured bootstrap log event for bundle-based extensions', () => {
    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: join(__dirname, '../fixtures/extensions'),
    });
    const event = createNuxtExtensionBootstrapLogEvent({ bootstrap });

    expect(event.bootstrap).toBe(bootstrap);
    expect(
      event.bootstrap.catalog.getTransitiveTargets({
        start: event.bootstrap.selectedExtensions,
        relationIds: ['dependencies'],
      }),
    ).toEqual(['default', 'shop']);
  });

  it('includes provider selection in the bootstrap log event', () => {
    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: join(__dirname, '../fixtures/extensions'),
    });
    const event = createNuxtExtensionBootstrapLogEvent({
      bootstrap,
      providerSelectionRuntimeConfig: {
        public: {
          providerSelection: {
            configuredProviders: {
              payment: 'stripe',
            },
            excludedProviderIds: ['invoice'],
            mismatches: [],
            selections: {
              payment: {
                capabilityId: 'payment',
                candidateProviderIds: ['invoice', 'stripe'],
                mode: 'configured',
                selectedProviderId: 'stripe',
              },
            },
          },
        },
      },
    });

    expect(event.providerSelection).toEqual({
      configuredProviders: {
        payment: 'stripe',
      },
      excludedProviderIds: ['invoice'],
      mismatches: [],
      selections: {
        payment: {
          capabilityId: 'payment',
          candidateProviderIds: ['invoice', 'stripe'],
          mode: 'configured',
          selectedProviderId: 'stripe',
        },
      },
    });
  });

  it('formats the native bootstrap log output', () => {
    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: join(__dirname, '../fixtures/extensions'),
    });

    expect(
      formatNuxtExtensionBootstrapLog({
        bootstrap,
        providerSelection: {
          configuredProviders: {
            payment: 'stripe',
          },
          excludedProviderIds: ['invoice'],
          mismatches: [],
          selections: {
            payment: {
              capabilityId: 'payment',
              candidateProviderIds: ['invoice', 'stripe'],
              mode: 'configured',
              selectedProviderId: 'stripe',
            },
          },
        },
      }),
    ).toBe(
      [
        'LORION Nuxt',
        'Selected: default',
        'Descriptors found: 5',
        'Injected: default, shop',
        'Not injected: admin, admin-profile, bundles',
        'Provider payment: stripe',
      ].join('\n'),
    );
  });
});
