import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  createNuxtRuntimeConfig,
  fromNuxtRuntimeConfig,
  getNuxtExtensionSelection,
  getNuxtProviderSelection,
  getPrivateNuxtRuntimeConfigScope,
  getNuxtRuntimeConfigScope,
  getPublicNuxtRuntimeConfigScope,
  mergeNuxtRuntimeConfig,
  resolveNuxtRuntimeConfigValue,
  toNuxtRuntimeConfig,
} from '../../src/runtime-config';
import {
  createNuxtRuntimeConfigFromSource,
  loadNuxtRuntimeConfigFragments,
  validateNuxtRuntimeConfigSourceScopes,
} from '../../src/runtime-config-node';

let tempDir: string;

beforeEach(() => {
  tempDir = path.join(os.tmpdir(), `lorion-nuxt-runtime-config-${Date.now()}-${Math.random()}`);
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function writeRuntimeConfig(scopeId: string, fileName: string, config: unknown): void {
  const dir = path.resolve(tempDir, 'runtime-config', scopeId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.resolve(dir, fileName), JSON.stringify(config), 'utf8');
}

describe('nuxt runtime config adapter', () => {
  it('projects fragments into the Nuxt runtime config shape', () => {
    const runtimeConfig = createNuxtRuntimeConfig({
      fragments: {
        billing: {
          public: {
            apiBase: '/api/billing',
          },
          private: {
            apiSecret: 'secret',
          },
        },
      },
    });

    expect(runtimeConfig).toEqual({
      billingApiSecret: 'secret',
      public: {
        billingApiBase: '/api/billing',
      },
    });
  });

  it('converts between sectioned and Nuxt runtime config shapes', () => {
    const nuxtRuntimeConfig = toNuxtRuntimeConfig({
      public: {
        mailApiBase: '/api/mail',
      },
      private: {
        mailToken: 'mail-token',
      },
    });

    expect(nuxtRuntimeConfig).toEqual({
      mailToken: 'mail-token',
      public: {
        mailApiBase: '/api/mail',
      },
    });
    expect(fromNuxtRuntimeConfig(nuxtRuntimeConfig)).toEqual({
      public: {
        mailApiBase: '/api/mail',
      },
      private: {
        mailToken: 'mail-token',
      },
    });
  });

  it('can keep private values in a section for runtimes that use that convention', () => {
    const runtimeConfig = toNuxtRuntimeConfig(
      {
        public: {
          billingApiBase: '/api/billing',
        },
        private: {
          billingApiSecret: 'secret',
        },
      },
      {
        privateOutput: 'section',
      },
    );

    expect(runtimeConfig).toEqual({
      public: {
        billingApiBase: '/api/billing',
      },
      private: {
        billingApiSecret: 'secret',
      },
    });
    expect(
      fromNuxtRuntimeConfig(runtimeConfig, {
        privateInput: 'section',
      }),
    ).toEqual({
      public: {
        billingApiBase: '/api/billing',
      },
      private: {
        billingApiSecret: 'secret',
      },
    });
    expect(
      getPrivateNuxtRuntimeConfigScope(runtimeConfig, 'billing', {
        privateInput: 'section',
      }),
    ).toEqual({
      apiSecret: 'secret',
    });
    expect(
      getNuxtRuntimeConfigScope(runtimeConfig, 'billing', {
        privateInput: 'section',
        visibility: 'private',
      }),
    ).toEqual({
      apiSecret: 'secret',
    });
    expect(
      resolveNuxtRuntimeConfigValue(runtimeConfig, 'billing', 'apiSecret', {
        privateInput: 'section',
        visibility: 'private',
      }),
    ).toBe('secret');
  });

  it('merges generated runtime config with existing Nuxt runtime config', () => {
    expect(
      mergeNuxtRuntimeConfig(
        {
          existingSecret: 'keep',
          public: {
            existingBase: '/api',
          },
        },
        {
          billingSecret: 'secret',
          public: {
            billingApiBase: '/api/billing',
          },
        },
      ),
    ).toEqual({
      existingSecret: 'keep',
      billingSecret: 'secret',
      public: {
        existingBase: '/api',
        billingApiBase: '/api/billing',
      },
    });
  });

  it('reads extension and provider selection projections from Nuxt runtime config', () => {
    const runtimeConfig = {
      public: {
        extensionSelection: {
          discoveredExtensionIds: ['payments', 'checkout', 'admin'],
          resolvedExtensionIds: ['admin', 'payments'],
          selectedExtensionIds: ['admin'],
        },
        providerSelection: {
          configuredProviders: {
            'payment-checkout': 'payment-provider-stripe',
          },
          excludedProviderIds: ['payment-provider-invoice'],
          mismatches: [],
          selections: {
            'payment-checkout': {
              capabilityId: 'payment-checkout',
              candidateProviderIds: ['payment-provider-invoice', 'payment-provider-stripe'],
              mode: 'configured',
              selectedProviderId: 'payment-provider-stripe',
            },
          },
        },
      },
    };

    expect(getNuxtExtensionSelection(runtimeConfig)).toEqual({
      discoveredExtensionIds: ['payments', 'checkout', 'admin'],
      notInjectedExtensionIds: ['checkout'],
      resolvedExtensionIds: ['admin', 'payments'],
      selectedExtensionIds: ['admin'],
    });
    expect(
      getNuxtProviderSelection(runtimeConfig)?.selections['payment-checkout']?.selectedProviderId,
    ).toBe('payment-provider-stripe');
  });

  it('returns an empty extension selection projection when Nuxt runtime config has none', () => {
    expect(getNuxtExtensionSelection({})).toEqual({
      discoveredExtensionIds: [],
      notInjectedExtensionIds: [],
      resolvedExtensionIds: [],
      selectedExtensionIds: [],
    });
  });

  it('ignores incomplete provider selection projections', () => {
    expect(
      getNuxtProviderSelection({
        public: {
          providerSelection: {},
        },
      }),
    ).toBeUndefined();
  });

  it('reads public and private scope views from Nuxt runtime config', () => {
    const runtimeConfig = createNuxtRuntimeConfig({
      fragments: {
        billing: {
          public: {
            apiBase: '/api/billing',
          },
          private: {
            apiSecret: 'secret',
          },
          contexts: {
            tenantA: {
              public: {
                apiBase: '/tenant-a/billing',
              },
            },
          },
        },
      },
    });

    expect(getPublicNuxtRuntimeConfigScope(runtimeConfig, 'billing')).toEqual({
      apiBase: '/api/billing',
    });
    expect(
      getPublicNuxtRuntimeConfigScope(runtimeConfig, 'billing', {
        contextId: 'tenantA',
      }),
    ).toEqual({
      apiBase: '/tenant-a/billing',
    });
    expect(getPrivateNuxtRuntimeConfigScope(runtimeConfig, 'billing')).toEqual({
      apiSecret: 'secret',
    });
  });

  it('maps a configured context input key to generic contexts', () => {
    const runtimeConfig = createNuxtRuntimeConfig({
      contextInputKey: 'tenants',
      contextOutputKey: '__tenants',
      fragments: {
        billing: {
          public: {
            apiBase: '/api/billing',
          },
          tenants: {
            tenantA: {
              public: {
                apiBase: '/tenant-a/billing',
              },
            },
          },
        },
      },
    });

    expect(runtimeConfig).toEqual({
      public: {
        billingApiBase: '/api/billing',
        __tenants: {
          tenantA: {
            billingApiBase: '/tenant-a/billing',
          },
        },
      },
    });
    expect(
      getPublicNuxtRuntimeConfigScope(runtimeConfig, 'billing', {
        contextId: 'tenantA',
        contextOutputKey: '__tenants',
      }),
    ).toEqual({
      apiBase: '/tenant-a/billing',
    });
  });

  it('loads runtime config fragments from a configured source directory', () => {
    writeRuntimeConfig('billing', 'runtime.config.json', {
      public: {
        apiBase: '/api/billing',
      },
    });

    const paths = [path.resolve(tempDir, 'runtime-config', '*', 'runtime.config.json')];

    expect(loadNuxtRuntimeConfigFragments({ paths })).toEqual(
      new Map([
        [
          'billing',
          {
            public: {
              apiBase: '/api/billing',
            },
          },
        ],
      ]),
    );

    expect(createNuxtRuntimeConfigFromSource({ paths })).toEqual({
      public: {
        billingApiBase: '/api/billing',
      },
    });
  });

  it('validates runtime config scopes through the Nuxt source adapter', () => {
    const scopeDir = path.resolve(tempDir, 'scopes', 'billing');
    mkdirSync(scopeDir, { recursive: true });
    writeRuntimeConfig('billing', 'runtime.config.json', {
      public: {
        apiBase: '/api/billing',
      },
    });
    writeFileSync(
      path.resolve(scopeDir, 'runtime-config.schema.json'),
      JSON.stringify({
        type: 'object',
        properties: {
          public: {
            type: 'object',
            properties: {
              apiBase: { type: 'string' },
            },
          },
        },
      }),
      'utf8',
    );

    const paths = [path.resolve(tempDir, 'runtime-config', '*', 'runtime.config.json')];

    expect(
      validateNuxtRuntimeConfigSourceScopes({ paths }, [
        {
          scopeId: 'billing',
          cwd: scopeDir,
        },
      ]),
    ).toEqual({
      fileName: paths[0],
      skipped: [],
      validated: [
        {
          configPath: path.resolve(tempDir, 'runtime-config', 'billing', 'runtime.config.json'),
          schemaPath: path.resolve(scopeDir, 'runtime-config.schema.json'),
          scopeId: 'billing',
        },
      ],
      varDir: '',
    });
  });
});
