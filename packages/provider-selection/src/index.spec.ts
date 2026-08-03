import { describe, expect, it } from 'vitest';

import {
  collectProviderRequests,
  collectProvidersByCapability,
  resolveItemProviderSelection,
  resolveProviderSelection,
  type CapabilityId,
  type ProviderSelectionRequest,
} from './index';

type Candidate = {
  capabilityId?: CapabilityId | CapabilityId[];
  providerId: string;
};

function candidate(providerId: string, capabilityId?: CapabilityId | CapabilityId[]): Candidate {
  return { providerId, ...(capabilityId ? { capabilityId } : {}) };
}

function request(
  capabilityId: string,
  providerId: string,
  sourceId: string,
): ProviderSelectionRequest {
  return { capabilityId, providerId, sourceId };
}

describe('collectProvidersByCapability', () => {
  it('collects deterministic unique providers for multiple capabilities', () => {
    expect(
      collectProvidersByCapability({
        items: [
          candidate('auth-oidc', 'auth'),
          candidate('auth-local', 'auth'),
          candidate('suite', ['auth', 'mailer']),
          candidate('suite', ['auth', 'mailer']),
        ],
        getCapabilityId: (item) => item.capabilityId,
        getProviderId: (item) => item.providerId,
      }),
    ).toEqual(
      new Map([
        ['auth', ['auth-local', 'auth-oidc', 'suite']],
        ['mailer', ['suite']],
      ]),
    );
  });
});

describe('collectProviderRequests', () => {
  it('projects provider descriptors into sourced requests', () => {
    expect(
      collectProviderRequests({
        items: [candidate('suite', ['mailer', 'auth']), candidate('auth-oidc', 'auth')],
        getCapabilityId: (item) => item.capabilityId,
        getProviderId: (item) => item.providerId,
        getSourceId: (item) => `explicit:${item.providerId}`,
      }),
    ).toEqual([
      request('auth', 'auth-oidc', 'explicit:auth-oidc'),
      request('auth', 'suite', 'explicit:suite'),
      request('mailer', 'suite', 'explicit:suite'),
    ]);
  });
});

describe('resolveProviderSelection', () => {
  const providersByCapability = new Map([
    ['auth', ['auth-local', 'auth-oidc']],
    ['checkout', ['checkout-invoice', 'checkout-stripe']],
  ]);

  it('prefers explicit over dependency over default and reports overridden choices', () => {
    const result = resolveProviderSelection({
      providersByCapability,
      requiredCapabilityIds: ['auth', 'checkout'],
      explicitRequests: [request('auth', 'auth-local', 'selection')],
      dependencyRequests: [
        request('auth', 'auth-oidc', 'product'),
        request('checkout', 'checkout-invoice', 'shop'),
      ],
      defaultRequests: [
        request('auth', 'auth-oidc', 'auth-oidc'),
        request('checkout', 'checkout-stripe', 'checkout-stripe'),
      ],
    });

    expect(result.slots).toEqual([
      {
        capabilityId: 'auth',
        state: 'selected',
        required: true,
        selectedProviderId: 'auth-local',
        candidateProviderIds: ['auth-local', 'auth-oidc'],
        overriddenProviderIds: ['auth-oidc'],
        mode: 'explicit',
      },
      {
        capabilityId: 'checkout',
        state: 'selected',
        required: true,
        selectedProviderId: 'checkout-invoice',
        candidateProviderIds: ['checkout-invoice', 'checkout-stripe'],
        overriddenProviderIds: ['checkout-stripe'],
        mode: 'dependency',
      },
    ]);
    expect(result.excludedProviderIds).toEqual(['auth-oidc', 'checkout-stripe']);
  });

  it('uses defaultFor only when no explicit root or descriptor dependency selects a provider', () => {
    const result = resolveProviderSelection({
      providersByCapability,
      requiredCapabilityIds: ['auth'],
      defaultRequests: [request('auth', 'auth-oidc', 'auth-oidc')],
    });

    expect(result.slots[0]).toMatchObject({
      state: 'selected',
      required: true,
      mode: 'default',
      selectedProviderId: 'auth-oidc',
    });
  });

  it('keeps an active capability unfilled when no consumer requires a provider', () => {
    const result = resolveProviderSelection({
      providersByCapability,
      activeCapabilityIds: ['auth'],
      requiredCapabilityIds: [],
    });

    expect(result).toEqual({
      slots: [
        {
          capabilityId: 'auth',
          state: 'unfilled',
          required: false,
          candidateProviderIds: ['auth-local', 'auth-oidc'],
        },
      ],
      excludedProviderIds: ['auth-local', 'auth-oidc'],
    });
  });

  it('applies a default to an active capability without making it required', () => {
    const result = resolveProviderSelection({
      providersByCapability,
      activeCapabilityIds: ['auth'],
      requiredCapabilityIds: [],
      defaultRequests: [request('auth', 'auth-oidc', 'auth-oidc')],
    });

    expect(result.slots[0]).toMatchObject({
      state: 'selected',
      required: false,
      mode: 'default',
      selectedProviderId: 'auth-oidc',
    });
  });

  it('does not activate a capability from a default alone', () => {
    expect(
      resolveProviderSelection({
        providersByCapability,
        requiredCapabilityIds: [],
        defaultRequests: [request('auth', 'auth-oidc', 'auth-oidc')],
      }),
    ).toEqual({ slots: [], excludedProviderIds: [] });
  });

  it('rejects two providers at the active precedence tier and names their sources', () => {
    expect(() =>
      resolveProviderSelection({
        providersByCapability,
        requiredCapabilityIds: ['auth'],
        dependencyRequests: [
          request('auth', 'auth-local', 'distribution-a'),
          request('auth', 'auth-oidc', 'distribution-b'),
        ],
      }),
    ).toThrow(
      /auth.*multiple dependency providers.*auth-local \(distribution-a\).*auth-oidc \(distribution-b\)/s,
    );
  });

  it('rejects conflicting lower-priority descriptor choices even when an explicit root wins', () => {
    expect(() =>
      resolveProviderSelection({
        providersByCapability,
        requiredCapabilityIds: ['auth'],
        explicitRequests: [request('auth', 'auth-local', 'selection')],
        dependencyRequests: [
          request('auth', 'auth-local', 'distribution-a'),
          request('auth', 'auth-oidc', 'distribution-b'),
        ],
      }),
    ).toThrow(
      /auth.*multiple dependency providers.*auth-local \(distribution-a\).*auth-oidc \(distribution-b\)/s,
    );
  });

  it('rejects conflicting defaults even when the capability is inactive', () => {
    expect(() =>
      resolveProviderSelection({
        providersByCapability,
        requiredCapabilityIds: [],
        defaultRequests: [
          request('auth', 'auth-local', 'auth-local'),
          request('auth', 'auth-oidc', 'auth-oidc'),
        ],
      }),
    ).toThrow(/auth.*multiple default providers.*auth-local.*auth-oidc/s);
  });

  it('rejects missing choices instead of selecting the first candidate', () => {
    expect(() =>
      resolveProviderSelection({
        providersByCapability,
        requiredCapabilityIds: ['auth'],
      }),
    ).toThrow(/no provider was selected by an explicit root, descriptor dependency, or defaultFor/);
  });

  it('rejects choices that do not name a provider candidate', () => {
    expect(() =>
      resolveProviderSelection({
        providersByCapability,
        requiredCapabilityIds: ['auth'],
        explicitRequests: [request('auth', 'missing', 'selection')],
      }),
    ).toThrow(/unknown provider "missing".*auth-local, auth-oidc/s);
  });
});

describe('resolveItemProviderSelection', () => {
  it('collects candidates and resolves the requested capabilities in one call', () => {
    const result = resolveItemProviderSelection({
      items: [
        candidate('auth-oidc', 'auth'),
        candidate('auth-local', 'auth'),
        candidate('mailer-postmark', 'mailer'),
      ],
      getCapabilityId: (item) => item.capabilityId,
      getProviderId: (item) => item.providerId,
      requiredCapabilityIds: ['auth'],
      dependencyRequests: [request('auth', 'auth-local', 'product')],
    });

    expect(result.providersByCapability).toEqual(
      new Map([
        ['auth', ['auth-local', 'auth-oidc']],
        ['mailer', ['mailer-postmark']],
      ]),
    );
    expect(result.slots[0]).toMatchObject({
      state: 'selected',
      required: true,
      selectedProviderId: 'auth-local',
      mode: 'dependency',
    });
  });
});
