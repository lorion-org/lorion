import { fileURLToPath } from 'node:url';
import { $fetch, createTest } from '@nuxt/test-utils/e2e';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('LORION Nuxt default runtime config source', () => {
  const hooks = createTest({
    rootDir: fileURLToPath(new URL('./fixtures/runtime-config-default-source', import.meta.url)),
    server: true,
  });

  beforeAll(hooks.beforeAll, hooks.ctx.options.setupTimeout);
  beforeEach(hooks.beforeEach);
  afterEach(hooks.afterEach);
  afterAll(hooks.afterAll, hooks.ctx.options.teardownTimeout);

  it('loads .runtimeconfig with the default file conventions when runtimeConfig is omitted', async () => {
    await expect($fetch('/api/runtime-config-default-source')).resolves.toEqual({
      apiBase: '/api/default-source-billing',
    });
  });
});
