import { describe, expect, it } from 'vitest';

import {
  createRuntimeConfigEnvKey,
  injectRuntimeEnvVars,
  projectRuntimeConfigEnvVars,
  runtimeEnvValueToShellLiteral,
  runtimeEnvVarsToShellAssignments,
  runtimeEnvVarsToString,
  toRuntimeEnvVars,
} from './env';

describe('runtime config env helpers', () => {
  it('creates prefixed env keys', () => {
    expect(
      createRuntimeConfigEnvKey({
        prefix: 'APP',
        visibility: 'public',
        scopeId: 'billing',
        key: 'apiBase',
      }),
    ).toBe('APP_PUBLIC_BILLING_API_BASE');
  });

  it('creates env vars from sectioned runtime config', () => {
    const envVars = toRuntimeEnvVars(
      {
        public: {
          billingApiBase: '/x',
          __contexts: {
            tenantA: {
              billingApiBase: '/tenant-a',
            },
          },
        },
        private: {
          billingApiSecret: 's',
        },
      },
      'APP',
    );

    expect(envVars).toEqual({
      APP_PUBLIC_BILLING_API_BASE: '/x',
      APP_PRIVATE_BILLING_API_SECRET: 's',
    });
  });

  it('creates env vars directly from runtime config fragments', () => {
    expect(
      projectRuntimeConfigEnvVars(
        [
          {
            scopeId: 'billing',
            config: {
              public: {
                apiBase: '/api/billing',
              },
              private: {
                token: 'secret',
              },
              environments: {
                tenantA: {
                  public: {
                    apiBase: '/tenant-a',
                  },
                },
              },
            },
          },
        ],
        {
          contextInputKey: 'environments',
          prefix: 'NUXT',
        },
      ),
    ).toEqual({
      NUXT_PUBLIC_BILLING_API_BASE: '/api/billing',
      NUXT_PRIVATE_BILLING_TOKEN: 'secret',
    });
  });

  it('lets process env values override generated defaults', () => {
    expect(
      injectRuntimeEnvVars(
        {
          APP_PUBLIC_BILLING_API_BASE: '/default',
          APP_PRIVATE_BILLING_API_SECRET: 'secret',
        },
        {
          APP_PUBLIC_BILLING_API_BASE: '/process',
        },
      ),
    ).toEqual({
      APP_PUBLIC_BILLING_API_BASE: '/process',
      APP_PRIVATE_BILLING_API_SECRET: 'secret',
    });
  });

  it('creates dotenv style output', () => {
    expect(runtimeEnvVarsToString({ A: 'x', B: 2 })).toBe('A=x\nB=2');
  });

  it('creates shell-safe assignments for env vars', () => {
    expect(runtimeEnvValueToShellLiteral("a'b")).toBe("'\"a'\\''b\"'");
    expect(runtimeEnvValueToShellLiteral(undefined)).toBe("'undefined'");
    expect(
      runtimeEnvVarsToShellAssignments({
        APP_PUBLIC_BILLING_API_BASE: '/api/billing',
        APP_PRIVATE_MAIL_TOKEN: 'mail-token',
      }),
    ).toBe(
      [
        'APP_PUBLIC_BILLING_API_BASE=\'"/api/billing"\'',
        'APP_PRIVATE_MAIL_TOKEN=\'"mail-token"\'',
      ].join('\n'),
    );
  });
});
