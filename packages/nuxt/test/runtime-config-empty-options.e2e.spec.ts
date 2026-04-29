import { fileURLToPath } from 'node:url';
import { $fetch, createTest } from '@nuxt/test-utils/e2e';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('LORION Nuxt empty runtime config options', () => {
  const hooks = createTest({
    rootDir: fileURLToPath(new URL('./fixtures/runtime-config-empty-options', import.meta.url)),
    server: true,
  });

  beforeAll(hooks.beforeAll, hooks.ctx.options.setupTimeout);
  beforeEach(hooks.beforeEach);
  afterEach(hooks.afterEach);
  afterAll(hooks.afterAll, hooks.ctx.options.teardownTimeout);

  it('does not load .runtimeconfig implicitly when runtimeConfig is an empty object', async () => {
    await expect($fetch('/api/runtime-config-empty-options')).resolves.toEqual({});
  });
});
