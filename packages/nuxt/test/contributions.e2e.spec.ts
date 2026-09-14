import { fileURLToPath } from 'node:url';
import { $fetch, createTest } from '@nuxt/test-utils/e2e';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
describe('Nuxt contribution request isolation', () => {
  const hooks = createTest({
    rootDir: fileURLToPath(new URL('./fixtures/contributions', import.meta.url)),
    server: true,
  });
  beforeAll(hooks.beforeAll, hooks.ctx.options.setupTimeout);
  beforeEach(hooks.beforeEach);
  afterEach(hooks.afterEach);
  afterAll(hooks.afterAll, hooks.ctx.options.teardownTimeout);
  it('constructs fresh mutable payloads for concurrent SSR applications', async () => {
    const responses = await Promise.all([$fetch<string>('/'), $fetch<string>('/')]);
    for (const response of responses) {
      expect(response).toContain('Request counter: 1');
      expect(response).not.toContain('Request counter: 2');
    }
  });
});
