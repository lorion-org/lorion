import { describe, expect, it } from 'vitest';

import {
  collectProviderDefaults,
  collectProviderPreferences,
  collectProvidersByCapability,
  collectSelectedProviderPreferences,
  resolveItemProviderSelection,
  resolveProviderSelection,
  resolveSelectedProviderRelationPreferences,
  type CapabilityId,
} from './index';

type Candidate = {
  capabilityId?: CapabilityId | CapabilityId[];
  providerId: string;
};

function createCandidate(
  providerId: string,
  capabilityId?: CapabilityId | CapabilityId[],
): Candidate {
  return {
    providerId,
    ...(capabilityId ? { capabilityId } : {}),
  };
}

describe('collectProvidersByCapability', () => {
  it('collects deterministic unique providers for multiple capabilities', () => {
    const providersByCapability = collectProvidersByCapability({
      items: [
        createCandidate('auth-oidc', 'auth'),
        createCandidate('auth-local-jwt', 'auth'),
        createCandidate('mailer-postmark', 'mailer'),
        createCandidate('auth-local-jwt', 'auth'),
        createCandidate('suite-provider', ['auth', 'mailer']),
        createCandidate('ignored'),
      ],
      getCapabilityId: (candidate) => candidate.capabilityId,
      getProviderId: (candidate) => candidate.providerId,
    });

    expect(providersByCapability).toEqual(
      new Map([
        ['auth', ['auth-local-jwt', 'auth-oidc', 'suite-provider']],
        ['mailer', ['mailer-postmark', 'suite-provider']],
      ]),
    );
  });
});

describe('collectProviderPreferences', () => {
  it('collects non-empty string preferences from provider descriptors', () => {
    const preferences = collectProviderPreferences({
      items: [
        {
          providerPreferences: {
            auth: 'auth-oidc',
            mailer: '',
            search: 42,
          },
        },
        {
          providerPreferences: {
            auth: 'auth-local-jwt',
          },
        },
        {
          providerPreferences: null,
        },
      ],
      getProviderPreferences: (candidate) => candidate.providerPreferences,
    });

    expect(preferences).toEqual({
      auth: 'auth-local-jwt',
    });
  });
});

describe('collectProviderDefaults', () => {
  it('collects provider-owned defaults by capability', () => {
    const defaults = collectProviderDefaults({
      items: [
        {
          id: 'auth-oidc',
          defaultFor: 'auth',
        },
        {
          id: 'stripe',
          defaultFor: ['payment-checkout'],
        },
      ],
      getDefaultFor: (candidate) => candidate.defaultFor,
      getProviderId: (candidate) => candidate.id,
    });

    expect(defaults).toEqual({
      auth: 'auth-oidc',
      'payment-checkout': 'stripe',
    });
  });
});

describe('collectSelectedProviderPreferences', () => {
  it('collects selected provider preferences from explicitly selected provider ids', () => {
    const preferences = collectSelectedProviderPreferences({
      items: [
        createCandidate('auth-oidc', 'auth'),
        createCandidate('auth-local-jwt', 'auth'),
        createCandidate('mailer-postmark', 'mailer'),
        createCandidate('suite-provider', ['auth', 'mailer']),
      ],
      getCapabilityId: (candidate) => candidate.capabilityId,
      getProviderId: (candidate) => candidate.providerId,
      selectedProviderIds: ['auth-local-jwt', 'suite-provider'],
    });

    expect(preferences).toEqual({
      auth: 'auth-local-jwt',
      mailer: 'suite-provider',
    });
  });
});

describe('resolveSelectedProviderRelationPreferences', () => {
  it('removes lower-priority provider relations when a provider is explicitly selected', () => {
    expect(
      resolveSelectedProviderRelationPreferences({
        providerId: 'auth-oidc',
        defaultFor: ['auth', 'profile'],
        providerPreferences: {
          auth: 'auth-oidc',
          storage: 'storage-s3',
        },
        selectedProviders: {
          auth: 'auth-local-jwt',
        },
      }),
    ).toEqual({
      defaultFor: ['profile'],
      providerPreferences: {
        storage: 'storage-s3',
      },
    });

    expect(
      resolveSelectedProviderRelationPreferences({
        providerId: 'auth-local-jwt',
        defaultFor: 'auth',
        selectedProviders: {
          auth: 'auth-local-jwt',
        },
      }),
    ).toEqual({
      defaultFor: 'auth',
    });
  });
});

describe('resolveProviderSelection', () => {
  it('prefers configured providers, then selected providers, then fallbacks, then first provider', () => {
    const result = resolveProviderSelection({
      providersByCapability: new Map([
        ['auth', ['auth-oidc', 'auth-local-jwt']],
        ['mailer', ['mailer-postmark', 'mailer-resend']],
        ['search', ['search-meilisearch', 'search-db']],
        ['storage', ['storage-local', 'storage-s3']],
      ]),
      configuredProviders: {
        auth: 'auth-oidc',
      },
      fallbackProviders: {
        mailer: 'mailer-resend',
        storage: 'storage-s3',
      },
      selectedProviders: {
        storage: 'storage-local',
      },
    });

    expect(result.selections).toEqual(
      new Map([
        [
          'auth',
          {
            capabilityId: 'auth',
            selectedProviderId: 'auth-oidc',
            candidateProviderIds: ['auth-local-jwt', 'auth-oidc'],
            mode: 'configured',
          },
        ],
        [
          'mailer',
          {
            capabilityId: 'mailer',
            selectedProviderId: 'mailer-resend',
            candidateProviderIds: ['mailer-postmark', 'mailer-resend'],
            mode: 'fallback',
          },
        ],
        [
          'search',
          {
            capabilityId: 'search',
            selectedProviderId: 'search-db',
            candidateProviderIds: ['search-db', 'search-meilisearch'],
            mode: 'first',
          },
        ],
        [
          'storage',
          {
            capabilityId: 'storage',
            selectedProviderId: 'storage-local',
            candidateProviderIds: ['storage-local', 'storage-s3'],
            mode: 'selected',
          },
        ],
      ]),
    );
    expect(result.mismatches).toEqual([]);
    expect(result.excludedProviderIds).toEqual([
      'auth-local-jwt',
      'mailer-postmark',
      'search-meilisearch',
      'storage-s3',
    ]);
  });

  it('skips capabilities with unknown configured providers', () => {
    const result = resolveProviderSelection({
      providersByCapability: new Map([['auth', ['auth-local-jwt', 'auth-oidc']]]),
      configuredProviders: {
        auth: 'missing-provider',
      },
    });

    expect(result.selections).toEqual(new Map());
    expect(result.mismatches).toEqual([
      {
        capabilityId: 'auth',
        configuredProviderId: 'missing-provider',
      },
    ]);
    expect(result.excludedProviderIds).toEqual([]);
  });

  it('does not silently fall back when a configured provider is invalid', () => {
    const result = resolveProviderSelection({
      providersByCapability: new Map([['auth', ['auth-local-jwt', 'auth-oidc']]]),
      configuredProviders: {
        auth: 'missing-provider',
      },
      fallbackProviders: {
        auth: 'auth-oidc',
      },
    });

    expect(result.selections).toEqual(new Map());
    expect(result.mismatches).toEqual([
      {
        capabilityId: 'auth',
        configuredProviderId: 'missing-provider',
      },
    ]);
    expect(result.excludedProviderIds).toEqual([]);
  });

  it('ignores mismatches for capabilities without providers', () => {
    const result = resolveProviderSelection({
      providersByCapability: new Map([
        ['auth', ['auth-local-jwt', 'auth-oidc']],
        ['mailer', ['mailer-postmark']],
      ]),
      configuredProviders: {
        auth: 'missing-provider',
        mailer: 'mailer-postmark',
        payments: 'stripe',
      },
    });

    expect(result.mismatches).toEqual([
      {
        capabilityId: 'auth',
        configuredProviderId: 'missing-provider',
      },
    ]);
    expect(result.selections.get('mailer')).toEqual({
      capabilityId: 'mailer',
      selectedProviderId: 'mailer-postmark',
      candidateProviderIds: ['mailer-postmark'],
      mode: 'configured',
    });
  });
});

describe('resolveItemProviderSelection', () => {
  it('collects and resolves provider selections in one call', () => {
    const result = resolveItemProviderSelection({
      items: [
        createCandidate('auth-oidc', 'auth'),
        createCandidate('auth-local-jwt', 'auth'),
        createCandidate('mailer-postmark', 'mailer'),
      ],
      getCapabilityId: (candidate) => candidate.capabilityId,
      getProviderId: (candidate) => candidate.providerId,
      configuredProviders: {
        auth: 'auth-local-jwt',
      },
      fallbackProviders: {
        mailer: 'mailer-postmark',
      },
    });

    expect(result.selections).toEqual(
      new Map([
        [
          'auth',
          {
            capabilityId: 'auth',
            selectedProviderId: 'auth-local-jwt',
            candidateProviderIds: ['auth-local-jwt', 'auth-oidc'],
            mode: 'configured',
          },
        ],
        [
          'mailer',
          {
            capabilityId: 'mailer',
            selectedProviderId: 'mailer-postmark',
            candidateProviderIds: ['mailer-postmark'],
            mode: 'fallback',
          },
        ],
      ]),
    );
    expect(result.providersByCapability).toEqual(
      new Map([
        ['auth', ['auth-local-jwt', 'auth-oidc']],
        ['mailer', ['mailer-postmark']],
      ]),
    );
    expect(result.mismatches).toEqual([]);
    expect(result.excludedProviderIds).toEqual(['auth-oidc']);
  });
});
