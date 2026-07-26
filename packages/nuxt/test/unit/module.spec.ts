import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import {
  CAPABILITY_SELECTION_OPTIONS,
  type CapabilitySelectionOption,
} from '@lorion-org/capability-composition';
import { createNuxtExtensionBootstrap } from '../../src/extensions';
import type { NuxtExtensionModuleOptions } from '../../src/types';
import lorionNuxtModule, {
  createConfiguredNuxtRuntimeConfig,
  createNuxtExtensionBootstrapLogEvent,
  formatNuxtExtensionBootstrapLog,
  reportNuxtExtensionBootstrap,
  shouldRegisterRuntimeConfigImports,
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

  it('follows the host Nuxt import scan policy for runtime config auto-imports', () => {
    expect(shouldRegisterRuntimeConfigImports({}, { scan: false })).toBe(false);
    expect(shouldRegisterRuntimeConfigImports({}, { scan: true })).toBe(true);
    expect(shouldRegisterRuntimeConfigImports({}, undefined)).toBe(true);
    expect(shouldRegisterRuntimeConfigImports({ imports: true }, { scan: false })).toBe(true);
    expect(shouldRegisterRuntimeConfigImports({ imports: false }, { scan: true })).toBe(false);
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
            fallbackProviders: {},
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
      fallbackProviders: {},
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

  it('reports the ids a host asked for rather than claiming the default selection', () => {
    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: join(__dirname, '../fixtures/extensions'),
      options: { selected: ['shop'] },
    });

    expect(bootstrap.requestedExtensions).toEqual(['shop']);
    expect(formatNuxtExtensionBootstrapLog({ bootstrap })).toContain('Requested shop');
  });

  it('formats the native bootstrap log output', () => {
    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: join(__dirname, '../fixtures/extensions'),
    });

    // `shop` is the provider that took part; `stripe` never resolved, and the report
    // says so rather than crediting it silently or dropping the capability.
    expect(
      formatNuxtExtensionBootstrapLog({
        bootstrap,
        providerSelection: {
          configuredProviders: {
            payment: 'shop',
          },
          excludedProviderIds: ['invoice'],
          fallbackProviders: {},
          mismatches: [],
          selections: {
            payment: {
              capabilityId: 'payment',
              candidateProviderIds: ['invoice', 'shop'],
              mode: 'configured',
              selectedProviderId: 'shop',
            },
            shipping: {
              capabilityId: 'shipping',
              candidateProviderIds: ['stripe'],
              mode: 'configured',
              selectedProviderId: 'stripe',
            },
          },
        },
      }),
    ).toBe(
      [
        'LORION Nuxt',
        '  Requested (not given)',
        '  Selected  default',
        '  payment   shop',
        '  shipping  stripe (not in this composition)',
        '',
        '  Resolved 2/5 descriptors',
        '    default, shop',
        '',
        '  Not resolved 3 descriptors',
        '    admin, admin-profile, bundles',
      ].join('\n'),
    );
  });
});

// Adapter conformance, behavioural. A type-level check cannot see whether an option
// is forwarded, only whether it is accepted, so every core option gets a case that
// changes the resolved set and asserts the change. `CAPABILITY_SELECTION_OPTIONS` is
// the core's own list, so an option added there without a case here fails to compile.
describe('core option forwarding', () => {
  function workspace(): string {
    const root = mkdtempSync(join(tmpdir(), 'lorion-nuxt-forward-'));
    const write = (dir: string, id: string, descriptor: Record<string, unknown>) => {
      const target = join(root, dir, id);
      mkdirSync(target, { recursive: true });
      writeFileSync(
        join(target, 'extension.json'),
        JSON.stringify({ version: '1.0.0', ...descriptor, id }),
      );
    };
    write('extensions', 'alpha', { dependencies: { beta: '^1.0.0' } });
    write('extensions', 'beta', {});
    write('extensions', 'gamma', { linked: 'beta' });
    write('extensions', 'grouped', {
      groups: [{ id: 'grouped-under-groups', version: '0.0.0', dependencies: { beta: '^1.0.0' } }],
    });
    write('features', 'delta', {});
    return root;
  }

  const ids = (root: string, options: NuxtExtensionModuleOptions): string[] =>
    createNuxtExtensionBootstrap({ rootDir: root, options }).resolvedExtensionIds.sort();

  // One case per core option. A missing key is a compile error, which is what makes
  // this a guard rather than a list of tests someone remembered to write.
  const cases: Record<CapabilitySelectionOption, (root: string) => void> = {
    capabilitiesDir: (root) => {
      expect(ids(root, { capabilitiesDir: 'features', selected: ['delta'] })).toEqual(['delta']);
    },
    descriptorPaths: (root) => {
      expect(
        ids(root, { descriptorPaths: ['features/*/extension.json'], selected: ['delta'] }),
      ).toEqual(['delta']);
    },
    descriptorSchema: (root) => {
      expect(() =>
        ids(root, {
          descriptorSchema: { type: 'object', required: ['owner'] },
          selected: ['beta'],
        }),
      ).toThrow(/required/);
    },
    virtualDescriptors: (root) => {
      expect(
        ids(root, {
          virtualDescriptors: [
            { id: 'virtual-group', version: '0.0.0', dependencies: { beta: '^1.0.0' } },
          ],
          selected: ['virtual-group'],
        }),
      ).toEqual(['beta', 'virtual-group']);
    },
    bundles: (root) => {
      writeFileSync(
        join(root, 'bundles.json'),
        JSON.stringify({
          bundles: [{ id: 'manifest-group', version: '0.0.0', dependencies: { beta: '^1.0.0' } }],
        }),
      );
      expect(ids(root, { bundles: { cwd: root }, selected: ['manifest-group'] })).toEqual([
        'beta',
        'manifest-group',
      ]);
    },
    nestedField: (root) => {
      // A non-default field name: `bundles` is the contract's default, so passing it
      // would prove nothing about forwarding.
      expect(ids(root, { nestedField: 'groups', selected: ['grouped-under-groups'] })).toEqual([
        'beta',
        'grouped-under-groups',
      ]);
      expect(() => ids(root, { selected: ['grouped-under-groups'] })).toThrow(/Unknown selected/);
    },
    relationDescriptors: (root) => {
      // Walking the relation is the policy's job, so both are set; dropping only the
      // relation descriptor must stop `gamma` from reaching `beta`.
      const policy = { resolutionRelationIds: ['dependencies', 'linked'] };
      expect(
        ids(root, {
          relationDescriptors: [{ id: 'linked', field: 'linked' }],
          policy,
          selected: ['gamma'],
        }),
      ).toEqual(['beta', 'gamma']);
      expect(ids(root, { policy, selected: ['gamma'] })).toEqual(['gamma']);
    },
    policy: (root) => {
      expect(ids(root, { policy: { resolutionRelationIds: [] }, selected: ['alpha'] })).toEqual([
        'alpha',
      ]);
    },
    baseDescriptors: (root) => {
      expect(ids(root, { baseDescriptors: ['beta'], selected: ['gamma'] })).toEqual([
        'beta',
        'gamma',
      ]);
    },
    defaultSelection: (root) => {
      expect(ids(root, { defaultSelection: ['beta'], selectionSeed: false })).toEqual(['beta']);
    },
    selected: (root) => {
      expect(ids(root, { selected: ['beta'] })).toEqual(['beta']);
    },
    selectionSeed: (root) => {
      expect(
        ids(root, { selectionSeed: { argv: [], env: { PICK: 'beta' }, envKeys: ['PICK'] } }),
      ).toEqual(['beta']);
      // The seed is one entry in the option list but several knobs; a host that
      // forwards only part of it forwards none of it in practice.
      expect(
        ids(root, { selectionSeed: { argv: ['--pick=beta'], env: {}, cliKeys: ['pick'] } }),
      ).toEqual(['beta']);
      // A logical `key` derives its env name; only an explicit `envKeys` is literal.
      expect(
        ids(root, { selectionSeed: { argv: [], env: { LORION_PICKS: 'beta' }, key: 'pick' } }),
      ).toEqual(['beta']);
    },
  };

  it.each([...CAPABILITY_SELECTION_OPTIONS])('forwards %s', (option) => {
    cases[option](workspace());
  });
});
