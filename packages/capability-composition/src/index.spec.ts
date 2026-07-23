import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  composeCapabilities,
  conventionActivation,
  resolveSelectedCapabilities,
  type ResolvedCapability,
} from './index';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const tempDir = tempDirs.pop();
    if (!tempDir) continue;
    rmSync(tempDir, { force: true, recursive: true });
  }
});

function camelCase(id: string): string {
  return id.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
}

type CapabilityInput = {
  id: string;
  dependencies?: Record<string, string>;
  providesFor?: string | string[];
  defaultFor?: string | string[];
  disabled?: boolean;
  web?: boolean;
  omitPackageName?: boolean;
};

function writeCapability(workspaceRoot: string, input: CapabilityInput): void {
  const directory = join(workspaceRoot, 'capabilities', input.id);
  mkdirSync(join(directory, 'src'), { recursive: true });

  const descriptor: Record<string, unknown> = { id: input.id, version: '1.0.0' };
  if (input.dependencies) descriptor.dependencies = input.dependencies;
  if (input.providesFor) descriptor.providesFor = input.providesFor;
  if (input.defaultFor) descriptor.defaultFor = input.defaultFor;
  if (input.disabled) descriptor.disabled = true;
  writeFileSync(join(directory, 'capability.json'), JSON.stringify(descriptor, null, 2));

  const packageJson: Record<string, unknown> = { version: '1.0.0', private: true, type: 'module' };
  if (!input.omitPackageName) packageJson.name = `@demo/${input.id}`;
  if (input.web) packageJson.exports = { './web': './src/web.ts' };
  writeFileSync(join(directory, 'package.json'), JSON.stringify(packageJson, null, 2));

  if (input.web) {
    writeFileSync(
      join(directory, 'src/web.ts'),
      `export const ${camelCase(input.id)}WebPlugin = { id: '${input.id}' };\n`,
    );
  }
}

function createWorkspace(capabilities: CapabilityInput[]): string {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'capability-composition-'));
  tempDirs.push(workspaceRoot);
  mkdirSync(join(workspaceRoot, 'capabilities'), { recursive: true });
  for (const capability of capabilities) writeCapability(workspaceRoot, capability);
  return workspaceRoot;
}

// The reference fixture: a platform base with a graph-only library, an auth slot
// with a default and an alternative provider, plus one default and one optional
// feature.
function referenceWorkspace(): string {
  return createWorkspace([
    { id: 'platform', dependencies: { tokens: '^1.0.0' }, web: true },
    { id: 'tokens' },
    { id: 'auth' },
    { id: 'auth-session', providesFor: 'auth', defaultFor: 'auth', web: true },
    { id: 'auth-oidc', providesFor: 'auth', web: true },
    { id: 'dashboard', web: true },
    { id: 'reports', web: true },
  ]);
}

function resolvedIds(capabilities: ResolvedCapability[]): string[] {
  return capabilities.map((capability) => capability.id).sort();
}

describe('resolveSelectedCapabilities', () => {
  it('resolves the base, selection, transitive dependencies, and the default provider', () => {
    const workspaceRoot = referenceWorkspace();

    const resolved = resolveSelectedCapabilities({
      workspaceRoot,
      seed: { baseDescriptors: ['platform', 'auth'], selected: ['dashboard'] },
    });

    // platform (base) -> tokens (dep); auth (base) -> auth-session (defaultFor);
    // dashboard (selected). auth-oidc and reports stay out.
    expect(resolvedIds(resolved)).toEqual([
      'auth',
      'auth-session',
      'dashboard',
      'platform',
      'tokens',
    ]);
  });

  it('lets an explicitly selected provider override the default and drop it', () => {
    const workspaceRoot = referenceWorkspace();

    const resolved = resolveSelectedCapabilities({
      workspaceRoot,
      seed: { baseDescriptors: ['platform', 'auth'], selected: ['dashboard', 'auth-oidc'] },
    });

    const ids = resolvedIds(resolved);
    expect(ids).toContain('auth-oidc');
    expect(ids).not.toContain('auth-session');
  });

  it('falls back to defaultSelection when the seed resolves nothing', () => {
    const workspaceRoot = referenceWorkspace();

    const resolved = resolveSelectedCapabilities({
      workspaceRoot,
      seed: {
        baseDescriptors: ['platform', 'auth'],
        defaultSelection: ['dashboard'],
        selectionSeed: false,
      },
    });

    expect(resolvedIds(resolved)).toContain('dashboard');
    expect(resolvedIds(resolved)).not.toContain('reports');
  });

  it('reads the selection from an injected env, not the ambient process', () => {
    const workspaceRoot = referenceWorkspace();

    const resolved = resolveSelectedCapabilities({
      workspaceRoot,
      seed: {
        baseDescriptors: ['platform', 'auth'],
        selectionSeed: { argv: [], env: { CAP: 'reports' }, envKeys: ['CAP'] },
      },
    });

    const ids = resolvedIds(resolved);
    expect(ids).toContain('reports');
    expect(ids).not.toContain('dashboard');
  });

  it('returns every discovered capability when nothing is selected or based', () => {
    const workspaceRoot = createWorkspace([
      { id: 'platform', web: true },
      { id: 'dashboard', web: true },
    ]);

    const resolved = resolveSelectedCapabilities({
      workspaceRoot,
      seed: { selectionSeed: false },
    });

    expect(resolvedIds(resolved)).toEqual(['dashboard', 'platform']);
  });

  it('rejects two providers that both declare defaultFor the same capability', () => {
    const workspaceRoot = createWorkspace([
      { id: 'auth' },
      { id: 'auth-session', providesFor: 'auth', defaultFor: 'auth', web: true },
      { id: 'auth-oidc', providesFor: 'auth', defaultFor: 'auth', web: true },
    ]);

    expect(() =>
      resolveSelectedCapabilities({ workspaceRoot, seed: { selected: ['auth'] } }),
    ).toThrow(/exactly one defaultFor provider per capability.*auth.*auth-oidc, auth-session/s);
  });

  it('excludes capabilities marked disabled', () => {
    const workspaceRoot = createWorkspace([
      { id: 'platform', web: true },
      { id: 'reports', web: true, disabled: true },
    ]);

    const resolved = resolveSelectedCapabilities({
      workspaceRoot,
      seed: { selectionSeed: false },
    });

    expect(resolvedIds(resolved)).toEqual(['platform']);
  });

  it('reports the offending package when a capability package.json lacks a name', () => {
    const workspaceRoot = createWorkspace([{ id: 'dashboard', omitPackageName: true }]);

    expect(() =>
      resolveSelectedCapabilities({ workspaceRoot, seed: { selected: ['dashboard'] } }),
    ).toThrow(/missing "name"/);
  });
});

describe('resolveSelectedCapabilities with virtual descriptors', () => {
  it('resolves through a host-provided grouping descriptor that has no package on disk', () => {
    const workspaceRoot = createWorkspace([
      { id: 'dashboard', web: true },
      { id: 'reports', web: true },
    ]);

    const resolved = resolveSelectedCapabilities({
      workspaceRoot,
      virtualDescriptors: [
        { id: 'suite', version: '0.0.0', dependencies: { dashboard: '^1.0.0', reports: '^1.0.0' } },
      ],
      seed: { selected: ['suite'] },
    });

    // suite (virtual) pulls its dependencies; it carries no package name itself,
    // and the discovered features keep theirs.
    expect(resolvedIds(resolved)).toEqual(['dashboard', 'reports', 'suite']);
    expect(resolved.find((capability) => capability.id === 'suite')?.packageName).toBe('');
    expect(resolved.find((capability) => capability.id === 'dashboard')?.packageName).toBe(
      '@demo/dashboard',
    );
  });

  it('never reads a package.json for a virtual base descriptor', () => {
    // `base` lives only as a virtual descriptor: resolution must not try to read a
    // package.json for it.
    const workspaceRoot = createWorkspace([{ id: 'dashboard', web: true }]);

    const resolved = resolveSelectedCapabilities({
      workspaceRoot,
      virtualDescriptors: [{ id: 'base', version: '0.0.0', dependencies: { dashboard: '^1.0.0' } }],
      seed: { baseDescriptors: ['base'] },
    });

    // base (virtual, always-on) pulls its dependency.
    expect(resolvedIds(resolved)).toEqual(['base', 'dashboard']);
  });
});

describe('resolveSelectedCapabilities with baseSeed', () => {
  it('replaces baseDescriptors from env when baseSeed parses a value', () => {
    const workspaceRoot = createWorkspace([
      { id: 'base-a', web: true },
      { id: 'base-b', web: true },
      { id: 'dashboard', web: true },
    ]);

    const resolved = resolveSelectedCapabilities({
      workspaceRoot,
      seed: {
        baseDescriptors: ['base-a'],
        baseSeed: { argv: [], env: { LORION_BASE: 'base-b' }, envKeys: ['LORION_BASE'] },
        selected: ['dashboard'],
      },
    });

    // base-b (env override) replaces base-a; dashboard from the selection.
    expect(resolvedIds(resolved)).toEqual(['base-b', 'dashboard']);
  });

  it('falls back to baseDescriptors when baseSeed parses nothing', () => {
    const workspaceRoot = createWorkspace([
      { id: 'base-a', web: true },
      { id: 'dashboard', web: true },
    ]);

    const resolved = resolveSelectedCapabilities({
      workspaceRoot,
      seed: {
        baseDescriptors: ['base-a'],
        baseSeed: { argv: [], env: {}, envKeys: ['LORION_BASE'] },
        selected: ['dashboard'],
      },
    });

    expect(resolvedIds(resolved)).toEqual(['base-a', 'dashboard']);
  });
});

describe('resolveSelectedCapabilities with a bundles manifest', () => {
  it('expands a discovered bundle manifest into base + default composition', () => {
    const workspaceRoot = createWorkspace([
      { id: 'ui', web: true },
      { id: 'auth', web: true },
      { id: 'catalog', web: true },
      { id: 'checkout', web: true },
    ]);
    writeFileSync(
      join(workspaceRoot, 'bundles.json'),
      JSON.stringify({
        base: 'base',
        default: 'shop',
        bundles: [
          { id: 'base', version: '0.0.0', dependencies: { ui: '^1.0.0', auth: '^1.0.0' } },
          { id: 'shop', version: '0.0.0', dependencies: { catalog: '^1.0.0', checkout: '^1.0.0' } },
        ],
      }),
    );

    // No explicit descriptors or seed ids: the manifest supplies the base floor
    // and the default selection, and the graph pulls their members.
    const resolved = resolveSelectedCapabilities({
      workspaceRoot,
      bundles: { cwd: workspaceRoot },
      seed: {},
    });

    expect(resolvedIds(resolved)).toEqual(['auth', 'base', 'catalog', 'checkout', 'shop', 'ui']);
    // The bundle groupings resolve but carry no package name.
    expect(resolved.find((capability) => capability.id === 'base')?.packageName).toBe('');
  });
});

describe('composeCapabilities', () => {
  const activation = conventionActivation({
    web: {
      marker: (directory) => existsSync(join(directory, 'src/web.ts')),
      exportName: (id) => `${camelCase(id)}WebPlugin`,
      exportSubpath: './web',
    },
  });

  function loadModule(specifier: string): Promise<Record<string, unknown>> {
    const id = specifier.replace(/^@demo\//, '').replace(/\/web$/, '');
    return Promise.resolve({ [`${camelCase(id)}WebPlugin`]: { id } });
  }

  it('discovers, activates, loads, and registers each active web capability', async () => {
    const workspaceRoot = createWorkspace([
      { id: 'platform', dependencies: { tokens: '^1.0.0' }, web: true },
      { id: 'tokens' },
      { id: 'auth' },
      { id: 'auth-session', providesFor: 'auth', defaultFor: 'auth', web: true },
      { id: 'dashboard', web: true },
    ]);

    const registered: Array<{ id: string; exportId: string }> = [];

    const activated = await composeCapabilities({
      workspaceRoot,
      seed: { baseDescriptors: ['platform', 'auth'], selected: ['dashboard'] },
      surface: 'web',
      activation,
      load: loadModule,
      register: (value, capability) => {
        registered.push({ id: capability.id, exportId: (value as { id: string }).id });
      },
    });

    // tokens (no web) and auth (the graph-only slot) resolve but never activate.
    expect(resolvedIds(activated)).toEqual(['auth-session', 'dashboard', 'platform']);
    expect(registered.map((entry) => entry.id).sort()).toEqual([
      'auth-session',
      'dashboard',
      'platform',
    ]);
    // The loaded export value is handed to the host's registration verbatim.
    expect(registered.every((entry) => entry.id === entry.exportId)).toBe(true);
  });

  it('skips a capability whose module lacks the expected export', async () => {
    const workspaceRoot = createWorkspace([{ id: 'dashboard', web: true }]);

    let registerCalls = 0;

    const activated = await composeCapabilities({
      workspaceRoot,
      seed: { selected: ['dashboard'] },
      surface: 'web',
      activation,
      load: () => Promise.resolve({}),
      register: () => {
        registerCalls += 1;
      },
    });

    expect(activated).toEqual([]);
    expect(registerCalls).toBe(0);
  });
});
