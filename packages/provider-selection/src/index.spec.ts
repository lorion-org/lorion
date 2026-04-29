import { describe, expect, it } from 'vitest';

import {
  collectProvidersByCapability,
  resolveItemProviderSelection,
  resolveProviderSelection,
  type CapabilityId,
} from './index';

type Candidate = {
  capabilityId?: CapabilityId;
  providerId: string;
};

function createCandidate(providerId: string, capabilityId?: CapabilityId): Candidate {
  return {
    providerId,
    ...(capabilityId ? { capabilityId } : {}),
  };
}

describe('collectProvidersByCapability', () => {
  it('collects deterministic unique providers for multiple capabilities', () => {
    const providersByCapability = collectProvidersByCapability({
      items: [
        createCandidate('keycloak', 'auth'),
        createCandidate('auth-local-jwt', 'auth'),
        createCandidate('mailer-postmark', 'mailer'),
        createCandidate('auth-local-jwt', 'auth'),
        createCandidate('ignored'),
      ],
      getCapabilityId: (candidate) => candidate.capabilityId,
      getProviderId: (candidate) => candidate.providerId,
    });

    expect(providersByCapability).toEqual(
      new Map([
        ['auth', ['auth-local-jwt', 'keycloak']],
        ['mailer', ['mailer-postmark']],
      ]),
    );
  });
});

describe('resolveProviderSelection', () => {
  it('prefers configured providers, then fallbacks, then first provider', () => {
    const result = resolveProviderSelection({
      providersByCapability: new Map([
        ['auth', ['keycloak', 'auth-local-jwt']],
        ['mailer', ['mailer-postmark', 'mailer-resend']],
        ['search', ['search-meilisearch', 'search-db']],
      ]),
      configuredProviders: {
        auth: 'keycloak',
      },
      fallbackProviders: {
        mailer: 'mailer-resend',
      },
    });

    expect(result.selections).toEqual(
      new Map([
        [
          'auth',
          {
            capabilityId: 'auth',
            selectedProviderId: 'keycloak',
            candidateProviderIds: ['auth-local-jwt', 'keycloak'],
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
      ]),
    );
    expect(result.mismatches).toEqual([]);
    expect(result.excludedProviderIds).toEqual([
      'auth-local-jwt',
      'mailer-postmark',
      'search-meilisearch',
    ]);
  });

  it('skips capabilities with unknown configured providers', () => {
    const result = resolveProviderSelection({
      providersByCapability: new Map([['auth', ['auth-local-jwt', 'keycloak']]]),
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
      providersByCapability: new Map([['auth', ['auth-local-jwt', 'keycloak']]]),
      configuredProviders: {
        auth: 'missing-provider',
      },
      fallbackProviders: {
        auth: 'keycloak',
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
        ['auth', ['auth-local-jwt', 'keycloak']],
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
        createCandidate('keycloak', 'auth'),
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
            candidateProviderIds: ['auth-local-jwt', 'keycloak'],
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
        ['auth', ['auth-local-jwt', 'keycloak']],
        ['mailer', ['mailer-postmark']],
      ]),
    );
    expect(result.mismatches).toEqual([]);
    expect(result.excludedProviderIds).toEqual(['keycloak']);
  });
});
