import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  composeCapabilities,
  conventionActivation,
  resolveSelectedCapabilities,
  resolveSurfaceModules,
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

describe('conventionActivation', () => {
  it('derives activation from a surface marker and export-name convention', () => {
    const workspaceRoot = createWorkspace([{ id: 'auth-oidc', web: true }, { id: 'tokens' }]);
    const activation = conventionActivation({
      web: {
        marker: (directory) => directory.endsWith('auth-oidc'),
        exportName: (id) => `${camelCase(id)}WebPlugin`,
        exportSubpath: './web',
      },
    });

    expect(
      activation('web', {
        directory: join(workspaceRoot, 'capabilities/auth-oidc'),
        id: 'auth-oidc',
      }),
    ).toEqual({
      exportSubpath: './web',
      exportName: 'authOidcWebPlugin',
    });
  });

  it('returns undefined for a missing marker or an unknown surface', () => {
    const activation = conventionActivation({
      web: {
        marker: () => false,
        exportName: (id) => `${id}WebPlugin`,
        exportSubpath: './web',
      },
    });

    expect(activation('web', { directory: '/nope', id: 'dashboard' })).toBeUndefined();
    expect(activation('server', { directory: '/anything', id: 'dashboard' })).toBeUndefined();
  });
});

describe('resolveSurfaceModules', () => {
  it('maps active surface capabilities to a static specifier and export name', () => {
    const workspaceRoot = createWorkspace([
      { id: 'platform', web: true },
      { id: 'dashboard', web: true },
      { id: 'tokens' },
    ]);
    const activation = conventionActivation({
      web: {
        marker: (directory) => existsSync(join(directory, 'src/web.ts')),
        exportName: (id) => `${camelCase(id)}WebPlugin`,
        exportSubpath: './web',
      },
    });

    const active = resolveSelectedCapabilities({ workspaceRoot, seed: { selectionSeed: false } });
    const modules = resolveSurfaceModules(active, 'web', activation);

    // tokens has no web surface and is skipped.
    expect(modules.map((entry) => entry.specifier).sort()).toEqual([
      '@demo/dashboard/web',
      '@demo/platform/web',
    ]);
    const dashboard = modules.find((entry) => entry.capability.id === 'dashboard');
    expect(dashboard?.exportName).toBe('dashboardWebPlugin');
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
