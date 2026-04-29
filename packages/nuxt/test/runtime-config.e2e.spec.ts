import { fileURLToPath } from 'node:url';
import { $fetch, createTest } from '@nuxt/test-utils/e2e';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('LORION Nuxt runtime config extension', () => {
  const hooks = createTest({
    rootDir: fileURLToPath(new URL('./fixtures/runtime-config', import.meta.url)),
    server: true,
  });

  beforeAll(hooks.beforeAll, hooks.ctx.options.setupTimeout);
  beforeEach(hooks.beforeEach);
  afterEach(hooks.afterEach);
  afterAll(hooks.afterAll, hooks.ctx.options.teardownTimeout);

  it('exposes configured public scope values through Nuxt runtime config', async () => {
    await expect($fetch('/api/runtime-config')).resolves.toEqual({
      apiBase: '/api/billing',
    });
  });

  it('auto-imports configured runtime config composables', async () => {
    await expect($fetch('/api/runtime-config-auto')).resolves.toEqual({
      public: {
        apiBase: '/api/billing',
      },
      context: {
        apiBase: '/tenant-a/billing',
      },
      private: {
        token: 'billing-token',
      },
      value: '/api/billing',
    });
  });
});
