import { describe, expect, it } from 'vitest';
import {
  createRuntimeConfigValidatorRegistry,
  resolveRuntimeConfigValidationMode,
  shouldRegisterRuntimeConfigValidationSchema,
  shouldRequireRuntimeConfigAtStartup,
  shouldValidateRuntimeConfigAtStartup,
} from './validation';

describe('runtime config validation policy', () => {
  it('resolves validation modes from policy metadata', () => {
    expect(resolveRuntimeConfigValidationMode(undefined)).toBe('optional');
    expect(resolveRuntimeConfigValidationMode('onUse')).toBe('onUse');
    expect(resolveRuntimeConfigValidationMode({ validation: 'startup' })).toBe('startup');
  });

  it('classifies registration, startup validation, and startup requirements', () => {
    expect(shouldRegisterRuntimeConfigValidationSchema({ validation: 'onUse' })).toBe(true);
    expect(shouldValidateRuntimeConfigAtStartup({ validation: 'onUse' })).toBe(false);
    expect(shouldValidateRuntimeConfigAtStartup({ validation: 'optional' })).toBe(true);
    expect(shouldRequireRuntimeConfigAtStartup({ validation: 'startup' })).toBe(true);
    expect(shouldRegisterRuntimeConfigValidationSchema({ validation: 'none' })).toBe(false);
  });
});

describe('RuntimeConfigValidatorRegistry', () => {
  it('validates runtime config fragments against registered schemas', () => {
    const registry = createRuntimeConfigValidatorRegistry({
      oidc: {
        type: 'object',
        properties: {
          public: {
            type: 'object',
            properties: {
              realm: {
                type: 'string',
                minLength: 1,
              },
            },
            required: ['realm'],
          },
        },
        required: ['public'],
      },
    });

    expect(() => registry.assert('oidc', { public: { realm: 'sandbox' } })).not.toThrow();
    expect(() => registry.assert('oidc', { public: { realm: '' } })).toThrow(
      /RuntimeConfig schema validation failed/,
    );
  });
});
