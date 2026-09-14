import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadNuxt } from 'nuxt';
import type { Nuxt } from '@nuxt/schema';
import lorion from '../../src/module';
import { createNuxtExtensionBootstrap } from '../../src/extensions';
let root: string;
let nuxt: Nuxt;
beforeEach(async () => {
  root = mkdtempSync(join(tmpdir(), 'lorion-contribution-options-'));
  nuxt = await loadNuxt({ cwd: root, ready: false, overrides: { telemetry: false } });
});
afterEach(async () => {
  await nuxt?.close();
  rmSync(root, { recursive: true, force: true });
});
describe('contribution opt-in configuration', () => {
  it('fails enabled contributions without bootstrap before framework registration', async () => {
    await expect(nuxt.runWithContext(() => lorion({ contributions: true }, nuxt))).rejects.toThrow(
      'require an extension composition bootstrap',
    );
    expect(nuxt.options.build.templates).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'lorion/contributions-plugin.mjs' }),
      ]),
    );
  });
  it('accepts an explicit empty bootstrap and completes native registration', async () => {
    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: root,
      options: { descriptorPaths: [], selected: [], selectionSeed: false },
    });
    expect(bootstrap.resolvedExtensions).toEqual([]);
    await nuxt.runWithContext(() =>
      lorion({ contributions: true, extensionBootstrap: bootstrap }, nuxt),
    );
    expect(nuxt.options.build.templates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'lorion/contributions-plugin.mjs' }),
      ]),
    );
  });
});
