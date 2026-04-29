import { fileURLToPath } from 'node:url';
import { $fetch, createTest } from '@nuxt/test-utils/e2e';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

describe('LORION Nuxt extension mounting', () => {
  const hooks = createTest({
    rootDir: fileURLToPath(new URL('./fixtures/extensions', import.meta.url)),
    server: true,
  });

  beforeAll(hooks.beforeAll, hooks.ctx.options.setupTimeout);
  beforeEach(hooks.beforeEach);
  afterEach(hooks.afterEach);
  afterAll(hooks.afterAll, hooks.ctx.options.teardownTimeout);

  it('mounts pages, components, plugins, server routes, and public runtime config from selected extensions', async () => {
    await expect($fetch('/shop')).resolves.toContain('Shop extension mounted');
    await expect($fetch('/shop')).resolves.toContain('ShopBadge works');
    await expect($fetch('/shop')).resolves.toContain('shop-plugin');
    await expect($fetch('/shop')).resolves.toContain('shop-composable');
    await expect($fetch('/api/shop-status')).resolves.toEqual({
      ok: true,
      source: 'shop',
    });
    await expect($fetch('/api/extension-selection')).resolves.toMatchObject({
      extensionSelection: {
        resolvedExtensionIds: ['default', 'shop'],
        selectedExtensionIds: ['default'],
      },
      shop: {
        title: 'Selected Shop',
      },
    });
  });

  it('does not mount pages from unselected extensions', async () => {
    await expect($fetch('/admin')).rejects.toMatchObject({
      response: {
        status: 404,
      },
    });
  });
});
