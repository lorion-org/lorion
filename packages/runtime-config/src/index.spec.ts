import { describe, expect, it } from 'vitest';

import {
  createRuntimeConfigKey,
  projectRuntimeConfigFragment,
  projectRuntimeConfigNamespace,
  runtimeConfigVisibilities,
} from './index';

describe('public entry point', () => {
  it('exports the public runtime-config helpers through the package entry', () => {
    expect(runtimeConfigVisibilities).toEqual(['public', 'private']);
    expect(createRuntimeConfigKey('billing', 'apiBase')).toBe('billingApiBase');
    expect(
      projectRuntimeConfigFragment('billing', {
        public: {
          apiBase: '/api/billing',
        },
      }).public,
    ).toEqual({
      billingApiBase: '/api/billing',
    });
    expect(
      projectRuntimeConfigNamespace('billing', {
        public: {
          apiBase: '/api/billing',
        },
      }).public.billing,
    ).toEqual({
      apiBase: '/api/billing',
    });
  });
});
