import { runInNewContext } from 'node:vm';
import cases from '../../../../examples/tests/contribution-cases.json';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadNuxt } from 'nuxt';
import type { Nuxt } from '@nuxt/schema';
import {
  ContributionError,
  createContributionRuntime,
  type ContributionRuntime,
} from '@lorion-org/contributions';
import { registerContributions } from '../../src/contributions';
import { createNuxtExtensionBootstrap } from '../../src/extensions';
const roots: string[] = [];
let nuxt: Nuxt;
beforeEach(async () => {
  const root = mkdtempSync(join(tmpdir(), 'lorion-nuxt-context-'));
  roots.push(root);
  nuxt = await loadNuxt({ cwd: root, ready: false, overrides: { telemetry: false } });
});
afterEach(async () => {
  await nuxt?.close();
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
  vi.clearAllMocks();
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'lorion-contributions-nuxt-'));
  roots.push(root);
  for (const [id, exported] of [
    ['a', true],
    ['b', false],
  ] as const) {
    const cwd = join(root, 'extensions', id);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        name: `@test/${id}`,
        exports: exported ? { './contributions': './contributions.ts' } : {},
      }),
    );
    writeFileSync(join(cwd, 'extension.json'), JSON.stringify({ id, version: '1.0.0' }));
    writeFileSync(join(cwd, 'contributions.ts'), 'export const contributionModule = {};');
  }
  return createNuxtExtensionBootstrap({
    rootDir: root,
    options: {
      descriptorPaths: ['extensions/*/extension.json'],
      selected: ['a', 'b'],
      selectionSeed: false,
    },
  });
}
async function templateSource(filename: string): Promise<string> {
  const template = nuxt.options.build.templates.find((entry) => entry.filename === filename);
  if (!template?.getContents) throw new Error(`Missing template: ${filename}`);
  return template.getContents({ nuxt, app: nuxt.apps.default!, options: template.options ?? {} });
}
function register(bootstrap: ReturnType<typeof createNuxtExtensionBootstrap>) {
  nuxt.runWithContext(() => registerContributions(bootstrap));
}
function plugin(module: unknown, source: string) {
  const body = source.replace(/^import .*;$/gm, '').replace('export default ', 'return ');
  return new Function(
    'm0',
    'ContributionError',
    'createContributionRuntime',
    'defineNuxtPlugin',
    body,
  )(module, ContributionError, createContributionRuntime, (value: unknown) => value) as {
    setup(): { provide: { contributions: ReturnType<typeof createContributionRuntime> } };
  };
}
describe('Nuxt contribution generation', () => {
  it('binds each module to its physical identity before factories run', async () => {
    register(fixture());
    const source = await templateSource('lorion/contributions-plugin.mjs');
    const create = vi.fn(() => ({}));
    for (const invalid of [
      { id: 'b', version: '1.0.0', create },
      { id: 'a', version: '2.0.0', create },
      undefined,
    ])
      expect(() => plugin(invalid, source)).toThrowError(
        expect.objectContaining({ code: 'MODULE_IDENTITY_MISMATCH' }),
      );
    expect(create).not.toHaveBeenCalled();
    const generated = plugin({ id: 'a', version: '1.0.0', create }, source);
    expect(create).not.toHaveBeenCalled();
    const first = generated.setup().provide.contributions;
    const second = generated.setup().provide.contributions;
    expect(first).not.toBe(second);
    expect(create).toHaveBeenCalledTimes(2);
    expect(first.inspect()).toEqual([]);
  });
  it('registers a universal plugin and typed native imports without putting runtime objects in config', async () => {
    register(fixture());
    const registered = nuxt.options.plugins.find(
      (entry) =>
        typeof entry !== 'string' && entry.src.endsWith('/lorion/contributions-plugin.mjs'),
    );
    expect(registered).toBeDefined();
    expect(registered).toHaveProperty('mode', 'all');
    const imports: Parameters<NonNullable<import('@nuxt/schema').NuxtHooks['imports:extend']>>[0] =
      [];
    await nuxt.callHook('imports:extend', imports);
    expect(imports).toContainEqual({
      name: 'useLorionContributions',
      from: '#build/lorion/contributions',
    });
    expect(await templateSource('lorion/contributions.ts')).toContain(
      'readonly ResolvedContributionItem<T>[]',
    );
    const source = await templateSource('lorion/contributions-plugin.mjs');
    expect(source).toContain("name: 'lorion-contributions'");
    expect(source).not.toContain('runtimeConfig');
    expect(source).not.toContain('node:');
    expect(source).not.toContain('@nuxt/kit');
  });
});

it.each(cases)('shared adapter scenario: $name', async (scenario) => {
  const root = mkdtempSync(join(tmpdir(), 'lorion-nuxt-case-'));
  roots.push(root);
  for (const descriptor of scenario.descriptors) {
    const cwd = join(root, 'extensions', `${descriptor.id}-${descriptor.version}`);
    mkdirSync(cwd, { recursive: true });
    writeFileSync(join(cwd, 'extension.json'), JSON.stringify(descriptor));
    writeFileSync(
      join(cwd, 'package.json'),
      JSON.stringify({
        name: `@test/${descriptor.id}-${descriptor.version}`,
        exports: { './capability': './capability.ts', './contributions': './contributions.ts' },
      }),
    );
    writeFileSync(join(cwd, 'capability.ts'), 'export const capability = {};');
    writeFileSync(join(cwd, 'contributions.ts'), 'export const contributionModule = {};');
  }
  register(
    createNuxtExtensionBootstrap({
      rootDir: root,
      options: {
        descriptorPaths: ['extensions/*/extension.json'],
        selected: scenario.selected,
        selectionSeed: false,
      },
    }),
  );
  const source = await templateSource('lorion/contributions-plugin.mjs');
  const context: Record<string, unknown> = {
    ContributionError,
    createContributionRuntime,
    defineNuxtPlugin: (value: unknown) => value,
  };
  const calls: string[] = [];
  const declarations = scenario.modules as Record<string, { failure?: boolean }>;
  const imports = [
    ...source.matchAll(/import \{ contributionModule as (m\d+) \} from "([^"]+)";/g),
  ];
  for (const [, variable, path] of imports) {
    const descriptor = JSON.parse(readFileSync(join(path!, '../extension.json'), 'utf8')) as {
      id: string;
      version: string;
    };
    context[variable!] = {
      ...descriptor,
      create: () => {
        calls.push(descriptor.id);
        const result = declarations[descriptor.id];
        if (result?.failure) throw new Error('PRIVATE_MARKER');
        return result;
      },
    };
  }
  const construct = (): ContributionRuntime =>
    runInNewContext(
      `${source.replace(/^import .*;$/gm, '').replace('export default ', 'const plugin = ')}\nplugin.setup().provide.contributions;`,
      context,
    ) as ContributionRuntime;
  if (scenario.error) {
    expect(construct).toThrowError(expect.objectContaining({ code: scenario.error }));
    try {
      construct();
    } catch (error) {
      expect(JSON.stringify(error)).not.toContain('PRIVATE_MARKER');
    }
  } else {
    const runtime = construct();
    expect(runtime.get({ owner: 'owner', point: 'items' }).map(({ id }) => id)).toEqual(
      scenario.ids,
    );
    if (scenario.selected.includes('owner'))
      expect(runtime.get({ owner: 'owner', point: 'other' }).map(({ id }) => id)).toEqual(['a']);
    else expect(runtime.inspect().every((row) => row.status === 'owner-not-selected')).toBe(true);
  }
  if (scenario.error === 'MODULE_FACTORY_FAILED') expect(calls).not.toContain('b');
});
