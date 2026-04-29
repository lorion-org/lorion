import { describe, expect, it } from 'vitest';

import {
  normalizeRuntimeConfigFragments,
  projectRuntimeConfigFragment,
  projectRuntimeConfigNamespace,
  projectRuntimeConfigNamespaces,
  projectSectionedRuntimeConfig,
} from './project';
import type { RuntimeConfigFragmentMap } from './types';

describe('normalizeRuntimeConfigFragments', () => {
  it('accepts maps and returns sorted named fragments', () => {
    const fragments: RuntimeConfigFragmentMap = new Map([
      ['mail', { public: { apiBase: '/mail' } }],
      [' billing ', { public: { apiBase: '/billing' } }],
      ['', { public: { apiBase: '/ignored' } }],
    ]);

    expect(normalizeRuntimeConfigFragments(fragments)).toEqual([
      {
        scopeId: 'billing',
        config: {
          public: {
            apiBase: '/billing',
          },
        },
      },
      {
        scopeId: 'mail',
        config: {
          public: {
            apiBase: '/mail',
          },
        },
      },
    ]);
  });

  it('accepts iterable named fragments', () => {
    expect(
      normalizeRuntimeConfigFragments([
        {
          scopeId: 'mail',
          config: {
            private: {
              token: 'secret',
            },
          },
        },
      ]),
    ).toEqual([
      {
        scopeId: 'mail',
        config: {
          private: {
            token: 'secret',
          },
        },
      },
    ]);
  });
});

describe('projectSectionedRuntimeConfig', () => {
  it('projects fragments into sectioned flat runtime config with context overrides', () => {
    const fragments: RuntimeConfigFragmentMap = new Map([
      [
        'billing',
        {
          public: {
            apiBase: '/x',
          },
          contexts: {
            tenantA: {
              public: {
                apiBase: '/tenant-a',
              },
            },
          },
        },
      ],
    ]);

    const projected = projectSectionedRuntimeConfig(fragments, {
      contextOutputKey: '__tenants',
    });

    expect(projected.public.billingApiBase).toBe('/x');
    expect(projected.public.__tenants).toEqual({
      tenantA: {
        billingApiBase: '/tenant-a',
      },
    });
    expect(projected.private).toEqual({});
  });

  it('can read contexts from a configured input key', () => {
    const projected = projectSectionedRuntimeConfig(
      [
        {
          scopeId: 'billing',
          config: {
            public: {
              apiBase: '/billing',
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
      ],
      {
        contextInputKey: 'tenants',
        contextOutputKey: '__tenants',
      },
    );

    expect(projected.public).toEqual({
      billingApiBase: '/billing',
      __tenants: {
        tenantA: {
          billingApiBase: '/tenant-a/billing',
        },
      },
    });
  });

  it('can project only selected scopes', () => {
    const projected = projectSectionedRuntimeConfig(
      new Map([
        ['billing', { public: { apiBase: '/billing' } }],
        ['docs', { public: { apiBase: '/docs' } }],
      ]),
      {
        scopeIds: ['billing'],
      },
    );

    expect(projected.public).toEqual({
      billingApiBase: '/billing',
    });
  });

  it('projects no scopes when the selected scope list is empty', () => {
    const projected = projectSectionedRuntimeConfig(
      new Map([['billing', { public: { apiBase: '/billing' } }]]),
      {
        scopeIds: [],
      },
    );

    expect(projected).toEqual({
      public: {},
      private: {},
    });
  });

  it('can skip context output when adapters only need global values', () => {
    const projected = projectSectionedRuntimeConfig(
      new Map([
        [
          'billing',
          {
            public: {
              apiBase: '/billing',
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
      {
        includeContexts: false,
      },
    );

    expect(projected.public).toEqual({
      billingApiBase: '/billing',
    });
  });

  it('does not project undefined values', () => {
    const projected = projectSectionedRuntimeConfig(
      new Map([
        [
          'billing',
          {
            public: {
              apiBase: undefined,
              label: 'Billing',
            },
          },
        ],
      ]),
    );

    expect(projected.public).toEqual({
      billingLabel: 'Billing',
    });
  });
});

describe('projectRuntimeConfigFragment', () => {
  it('projects one local fragment into flat sectioned runtime config', () => {
    expect(
      projectRuntimeConfigFragment('auth', {
        public: {
          url: 'https://auth.example.test',
        },
        private: {
          clientSecret: 'secret',
        },
      }),
    ).toEqual({
      public: {
        authUrl: 'https://auth.example.test',
      },
      private: {
        authClientSecret: 'secret',
      },
    });
  });
});

describe('projectRuntimeConfigNamespaces', () => {
  it('projects public values under public namespace and private values to server-only namespace', () => {
    const projected = projectRuntimeConfigNamespaces([
      {
        scopeId: 'billing',
        config: {
          public: {
            apiBase: '/api/billing',
          },
          private: {
            apiKey: 'secret',
          },
        },
      },
    ]);

    expect(projected).toEqual({
      public: {
        billing: {
          apiBase: '/api/billing',
        },
      },
      billing: {
        apiKey: 'secret',
      },
    });
  });

  it('applies context values over global fragment values', () => {
    const projected = projectRuntimeConfigNamespaces(
      [
        {
          scopeId: 'billing',
          config: {
            public: {
              apiBase: '/api/billing',
            },
            private: {
              apiKey: 'global-secret',
            },
            contexts: {
              tenantA: {
                public: {
                  apiBase: '/tenant-a/billing',
                },
                private: {
                  apiKey: 'tenant-secret',
                },
              },
            },
          },
        },
      ],
      {
        contextId: 'tenantA',
      },
    );

    expect(projected.public.billing).toEqual({
      apiBase: '/tenant-a/billing',
    });
    expect(projected.billing).toEqual({
      apiKey: 'tenant-secret',
    });
  });

  it('can project selected scopes into a flat namespace', () => {
    const projected = projectRuntimeConfigNamespaces(
      [
        {
          scopeId: 'billing',
          config: {
            public: {
              apiBase: '/api/billing',
            },
            private: {
              apiKey: 'secret',
            },
          },
        },
        {
          scopeId: 'mail',
          config: {
            public: {
              apiBase: '/api/mail',
            },
          },
        },
      ],
      {
        namespaceStrategy: 'flat',
        scopeIds: ['billing'],
      },
    );

    expect(projected).toEqual({
      public: {
        apiBase: '/api/billing',
      },
      apiKey: 'secret',
    });
  });

  it('projects no namespaces when the selected scope list is empty', () => {
    expect(
      projectRuntimeConfigNamespaces(
        [
          {
            scopeId: 'billing',
            config: {
              public: {
                apiBase: '/api/billing',
              },
            },
          },
        ],
        {
          scopeIds: [],
        },
      ),
    ).toEqual({
      public: {},
    });
  });
});

describe('projectRuntimeConfigNamespace', () => {
  it('projects one local fragment into a named runtime namespace', () => {
    expect(
      projectRuntimeConfigNamespace('billing', {
        public: {
          apiBase: '/api/billing',
        },
        private: {
          token: 'billing-token',
        },
      }),
    ).toEqual({
      public: {
        billing: {
          apiBase: '/api/billing',
        },
      },
      billing: {
        token: 'billing-token',
      },
    });
  });
});
