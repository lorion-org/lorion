import { describe, expect, it } from 'vitest';

import { createRuntimeConfigKey, stripRuntimeConfigScopePrefix, toSnakeUpperCase } from './key';

describe('runtime config keys', () => {
  it('normalizes scope and key names with stable camelCase behavior', () => {
    expect(createRuntimeConfigKey('billing', 'apiBase')).toBe('billingApiBase');
    expect(createRuntimeConfigKey('billing', 'api-url_v2')).toBe('billingApiUrlV2');
    expect(createRuntimeConfigKey('mail_scope', 'SOME value')).toBe('mailScopeSomeValue');
    expect(createRuntimeConfigKey('search/module', 'basePath')).toBe('searchModuleBasePath');
  });

  it('allows adapters to provide an explicit key strategy', () => {
    expect(
      createRuntimeConfigKey('billing', 'apiBase', {
        keyStrategy: (scopeId, key) => `${scopeId}.${key}`,
      }),
    ).toBe('billing.apiBase');
  });

  it('strips the scope prefix back to an unprefixed config key', () => {
    expect(stripRuntimeConfigScopePrefix('billing', 'billingApiBase')).toBe('apiBase');
    expect(stripRuntimeConfigScopePrefix('billing', 'billing')).toBeUndefined();
    expect(stripRuntimeConfigScopePrefix('billing', 'mailApiBase')).toBeUndefined();
  });

  it('converts runtime keys into env-safe uppercase snake case', () => {
    expect(toSnakeUpperCase('billingApiBase')).toBe('BILLING_API_BASE');
    expect(toSnakeUpperCase('billing/api base')).toBe('BILLING_API_BASE');
    expect(toSnakeUpperCase('__billing--api__base__')).toBe('BILLING_API_BASE');
  });
});
