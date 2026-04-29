import { describe, expect, it } from 'vitest';

import { resolveRuntimeConfigValue, resolveRuntimeConfigValueFromRuntimeConfig } from './resolve';

describe('resolveRuntimeConfigValue', () => {
  it('prefers context values before global values', () => {
    const value = resolveRuntimeConfigValue<string>(
      {
        billingApiBase: 'global',
        __tenants: {
          tenantA: {
            billingApiBase: 'tenant',
          },
        },
      },
      'billing',
      'apiBase',
      {
        contextId: 'tenantA',
        contextOutputKey: '__tenants',
      },
    );

    expect(value).toBe('tenant');
  });

  it('falls back to global value and default value', () => {
    expect(
      resolveRuntimeConfigValue<string>(
        {
          billingApiBase: 'global',
          __contexts: {
            tenantA: {},
          },
        },
        'billing',
        'apiBase',
        { contextId: 'tenantA' },
      ),
    ).toBe('global');

    expect(
      resolveRuntimeConfigValue<string>({}, 'billing', 'apiBase', { defaultValue: 'fallback' }),
    ).toBe('fallback');
  });

  it('supports custom key strategies', () => {
    expect(
      resolveRuntimeConfigValue<string>(
        {
          'billing.apiBase': '/billing',
        },
        'billing',
        'apiBase',
        {
          keyStrategy: (scopeId, key) => `${scopeId}.${key}`,
        },
      ),
    ).toBe('/billing');
  });
});

describe('resolveRuntimeConfigValueFromRuntimeConfig', () => {
  it('resolves from a sectioned runtime config container', () => {
    const value = resolveRuntimeConfigValueFromRuntimeConfig<string>(
      {
        private: {
          billingApiKey: 'secret',
        },
      },
      'billing',
      'apiKey',
      { visibility: 'private' },
    );

    expect(value).toBe('secret');
  });
});
