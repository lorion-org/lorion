import { describe, expect, it } from 'vitest';
import {
  createContributionContract,
  createCapabilityRuntime,
  defineCapability,
  defineContribution,
  defineExtensionPoint,
  getCapabilityProviderSelection,
  getCapabilityRuntimeConfig,
  getCapabilityRuntimeConfigScope,
} from './index';

const MenuExtension = defineExtensionPoint<{ id: string }>('test.menu');

describe('createCapabilityRuntime', () => {
  it('collects contributions from enabled capabilities', () => {
    const runtime = createCapabilityRuntime([
      defineCapability({
        id: 'owner',
        manifest: { id: 'owner', version: '0.1.0' },
        contributions: [defineContribution(MenuExtension, [{ id: 'owner-item' }])],
      }),
      defineCapability({
        id: 'consumer',
        manifest: { id: 'consumer', version: '0.1.0', dependencies: { owner: '0.1.0' } },
        contributions: [defineContribution(MenuExtension, [{ id: 'consumer-item' }])],
      }),
    ]);

    expect(runtime.capabilities.map((capability) => capability.id)).toEqual(['owner', 'consumer']);
    expect(runtime.getContributions(MenuExtension)).toEqual([
      { id: 'owner-item' },
      { id: 'consumer-item' },
    ]);
  });

  it('fails when an enabled capability depends on a missing capability', () => {
    expect(() =>
      createCapabilityRuntime([
        defineCapability({
          id: 'consumer',
          manifest: { id: 'consumer', version: '0.1.0', dependencies: { missing: '0.1.0' } },
        }),
      ]),
    ).toThrow('Unknown capability "consumer" dependencies: missing');
  });

  it('skips disabled capabilities', () => {
    const runtime = createCapabilityRuntime([
      defineCapability({
        id: 'disabled',
        manifest: { id: 'disabled', version: '0.1.0', disabled: true },
        contributions: [defineContribution(MenuExtension, [{ id: 'disabled-item' }])],
      }),
    ]);

    expect(runtime.capabilities).toEqual([]);
    expect(runtime.getContributions(MenuExtension)).toEqual([]);
  });

  it('creates reusable contribution contracts', () => {
    const contract = createContributionContract<{ id: string }>('test.contract');
    const runtime = createCapabilityRuntime([
      defineCapability({
        id: 'owner',
        manifest: { id: 'owner', version: '0.1.0' },
        contributions: [contract.define([{ id: 'owner-item' }])],
      }),
    ]);

    expect(contract.extensionPoint.id).toBe('test.contract');
    expect(contract.get(runtime)).toEqual([{ id: 'owner-item' }]);
  });

  it('resolves provider selection from capability descriptors', () => {
    const runtime = createCapabilityRuntime([
      defineCapability({
        id: 'provider-a',
        manifest: { id: 'provider-a', version: '0.1.0', providesFor: 'checkout' },
      }),
      defineCapability({
        id: 'provider-b',
        manifest: {
          id: 'provider-b',
          version: '0.1.0',
          defaultFor: 'checkout',
          providesFor: 'checkout',
        },
      }),
      defineCapability({
        id: 'shop',
        manifest: {
          id: 'shop',
          version: '0.1.0',
        },
      }),
    ]);

    const selection = getCapabilityProviderSelection(runtime);

    expect(Object.fromEntries(selection.selections)).toEqual({
      checkout: {
        capabilityId: 'checkout',
        candidateProviderIds: ['provider-a', 'provider-b'],
        mode: 'fallback',
        selectedProviderId: 'provider-b',
      },
    });
    expect(selection.excludedProviderIds).toEqual(['provider-a']);
  });

  it('uses selected providers before descriptor preferences and defaults', () => {
    const runtime = createCapabilityRuntime([
      defineCapability({
        id: 'provider-a',
        manifest: { id: 'provider-a', version: '0.1.0', providesFor: 'checkout' },
      }),
      defineCapability({
        id: 'provider-b',
        manifest: {
          id: 'provider-b',
          version: '0.1.0',
          defaultFor: 'checkout',
          providesFor: 'checkout',
        },
      }),
      defineCapability({
        id: 'shop',
        manifest: {
          id: 'shop',
          version: '0.1.0',
          providerPreferences: {
            checkout: 'provider-b',
          },
        },
      }),
    ]);

    const selection = getCapabilityProviderSelection(runtime, {
      selectedProviders: {
        checkout: 'provider-a',
      },
    });

    expect(Object.fromEntries(selection.selections)).toEqual({
      checkout: {
        capabilityId: 'checkout',
        candidateProviderIds: ['provider-a', 'provider-b'],
        mode: 'selected',
        selectedProviderId: 'provider-a',
      },
    });
    expect(selection.excludedProviderIds).toEqual(['provider-b']);
  });

  it('reads scoped public runtime config without exposing private values', () => {
    const runtimeConfig = {
      public: {
        'auth-oidc': {
          clientId: 'web',
          realm: 'demo',
        },
      },
    };

    expect(getCapabilityRuntimeConfig(runtimeConfig, 'auth-oidc')).toEqual({
      public: {
        clientId: 'web',
        realm: 'demo',
      },
    });
    expect(getCapabilityRuntimeConfigScope(runtimeConfig, 'missing')).toEqual({});
  });
});
