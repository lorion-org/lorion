import { describe, expect, it } from 'vitest';

import { projectSectionedRuntimeConfig } from './project';
import {
  getPrivateRuntimeConfigScope,
  getPublicRuntimeConfigScope,
  getRuntimeConfigFragment,
  getRuntimeConfigScope,
} from './scope';

describe('getRuntimeConfigScope', () => {
  it('reconstructs an unprefixed public scope view from sectioned runtime config', () => {
    const runtimeConfig = projectSectionedRuntimeConfig(
      new Map([
        [
          'keycloak',
          {
            public: {
              url: 'https://auth.example.test',
              realm: 'main',
            },
          },
        ],
      ]),
    );

    expect(getRuntimeConfigScope(runtimeConfig, 'keycloak')).toEqual({
      url: 'https://auth.example.test',
      realm: 'main',
    });
  });

  it('can select private scope values through the explicit visibility option', () => {
    const runtimeConfig = projectSectionedRuntimeConfig(
      new Map([
        [
          'keycloak',
          {
            private: {
              clientSecret: 'secret',
            },
          },
        ],
      ]),
    );

    expect(
      getRuntimeConfigScope(runtimeConfig, 'keycloak', {
        visibility: 'private',
      }),
    ).toEqual({
      clientSecret: 'secret',
    });
  });

  it('offers public and private convenience helpers', () => {
    const runtimeConfig = projectSectionedRuntimeConfig(
      new Map([
        [
          'billing',
          {
            public: {
              apiBase: '/api/billing',
            },
            private: {
              apiSecret: 'secret',
            },
          },
        ],
      ]),
    );

    expect(getPublicRuntimeConfigScope(runtimeConfig, 'billing')).toEqual({
      apiBase: '/api/billing',
    });
    expect(getPrivateRuntimeConfigScope(runtimeConfig, 'billing')).toEqual({
      apiSecret: 'secret',
    });
  });

  it('applies context overrides over global values', () => {
    const runtimeConfig = projectSectionedRuntimeConfig(
      new Map([
        [
          'billing',
          {
            public: {
              apiBase: '/api/billing',
              label: 'Billing',
            },
            contexts: {
              tenantA: {
                public: {
                  apiBase: '/tenant-a/billing',
                },
              },
            },
          },
        ],
      ]),
    );

    expect(
      getPublicRuntimeConfigScope(runtimeConfig, 'billing', {
        contextId: 'tenantA',
      }),
    ).toEqual({
      apiBase: '/tenant-a/billing',
      label: 'Billing',
    });
  });

  it('can use explicit keys when adapters want a hard contract', () => {
    const runtimeConfig = {
      public: {
        keycloakUrl: 'https://auth.example.test',
        keycloakRealm: 'main',
        keycloakUnused: 'ignored',
      },
    };

    expect(
      getPublicRuntimeConfigScope(runtimeConfig, 'keycloak', {
        keys: ['url', 'realm', 'missing'],
      }),
    ).toEqual({
      url: 'https://auth.example.test',
      realm: 'main',
    });
  });
});

describe('getRuntimeConfigFragment', () => {
  it('can reconstruct a fragment-shaped public and private view', () => {
    const runtimeConfig = projectSectionedRuntimeConfig(
      new Map([
        [
          'keycloak',
          {
            public: {
              url: 'https://auth.example.test',
            },
            private: {
              clientSecret: 'secret',
            },
          },
        ],
      ]),
    );

    expect(getRuntimeConfigFragment(runtimeConfig, 'keycloak')).toEqual({
      public: {
        url: 'https://auth.example.test',
      },
      private: {
        clientSecret: 'secret',
      },
    });
  });

  it('can restrict fragment reconstruction to explicit public and private keys', () => {
    const runtimeConfig = projectSectionedRuntimeConfig(
      new Map([
        [
          'billing',
          {
            public: {
              apiBase: '/api/billing',
              label: 'Billing',
            },
            private: {
              apiKey: 'secret',
              token: 'token',
            },
          },
        ],
      ]),
    );

    expect(
      getRuntimeConfigFragment(runtimeConfig, 'billing', {
        keys: {
          public: ['apiBase'],
          private: ['apiKey'],
        },
      }),
    ).toEqual({
      public: {
        apiBase: '/api/billing',
      },
      private: {
        apiKey: 'secret',
      },
    });
  });
});
