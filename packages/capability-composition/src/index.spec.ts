import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  composeCapabilities,
  conventionActivation,
  createWorkspaceLoad,
  resolveSelectedCapabilities,
  resolveWorkspaceRoot,
  type ResolvedCapability,
  CAPABILITY_SELECTION_OPTIONS,
  describeComposition,
  formatCompositionReport,
  notResolved,
  type CapabilitySelectionInput,
  type CapabilitySelectionOption,
  type CapabilitySelectionSeed,
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

describe('resolveSelectedCapabilities with a bundles manifest', () => {
  it('expands a discovered bundle manifest into virtual grouping descriptors', () => {
    const workspaceRoot = createWorkspace([
      { id: 'ui', web: true },
      { id: 'auth', web: true },
      { id: 'catalog', web: true },
      { id: 'checkout', web: true },
    ]);
    writeFileSync(
      join(workspaceRoot, 'bundles.json'),
      JSON.stringify({
        bundles: [
          { id: 'base', version: '0.0.0', dependencies: { ui: '^1.0.0', auth: '^1.0.0' } },
          { id: 'shop', version: '0.0.0', dependencies: { catalog: '^1.0.0', checkout: '^1.0.0' } },
        ],
      }),
    );

    // The manifest supplies the groupings; the host names which of them is the
    // base floor and which is the default selection, and the graph pulls their
    // members.
    const resolved = resolveSelectedCapabilities({
      workspaceRoot,
      bundles: { cwd: workspaceRoot },
      seed: { baseDescriptors: ['base'], defaultSelection: ['shop'] },
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

// A workspace whose packages live under `packages/<folder>`, each an ESM package
// declaring `exports`. `.mjs` targets keep the dynamic import ESM regardless of the
// package.json `type`, so the tests exercise the loader, not module-format quirks.
function createPackageWorkspace(
  packages: {
    folder: string;
    packageJson: Record<string, unknown>;
    files: Record<string, string>;
  }[],
): string {
  const workspaceRoot = mkdtempSync(join(tmpdir(), 'workspace-load-'));
  tempDirs.push(workspaceRoot);
  for (const pkg of packages) {
    const directory = join(workspaceRoot, 'packages', pkg.folder);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, 'package.json'), JSON.stringify(pkg.packageJson, null, 2));
    for (const [name, contents] of Object.entries(pkg.files)) {
      writeFileSync(join(directory, name), contents);
    }
  }
  return workspaceRoot;
}

describe('createWorkspaceLoad', () => {
  it('loads a scoped specifier from its workspace package folder', async () => {
    const workspaceRoot = createPackageWorkspace([
      {
        folder: 'alpha',
        packageJson: { name: '@scope/alpha', type: 'module', exports: { '.': './index.mjs' } },
        files: { 'index.mjs': `export const id = 'alpha';\n` },
      },
    ]);

    const load = createWorkspaceLoad({ workspaceRoot });

    // The scope is dropped: `@scope/alpha` addresses the folder `alpha`.
    expect(await load('@scope/alpha')).toMatchObject({ id: 'alpha' });
  });

  it('loads an unscoped specifier', async () => {
    const workspaceRoot = createPackageWorkspace([
      {
        folder: 'beta',
        packageJson: { name: 'beta', type: 'module', exports: { '.': './index.mjs' } },
        files: { 'index.mjs': `export const id = 'beta';\n` },
      },
    ]);

    expect(await createWorkspaceLoad({ workspaceRoot })('beta')).toMatchObject({ id: 'beta' });
  });

  it('resolves a subpath through a conditional export', async () => {
    const workspaceRoot = createPackageWorkspace([
      {
        folder: 'gamma',
        packageJson: {
          name: '@scope/gamma',
          type: 'module',
          exports: { './server': { types: './server.d.ts', import: './server.mjs' } },
        },
        files: { 'server.mjs': `export const surface = 'server';\n` },
      },
    ]);

    // The conditional object resolves to its runtime `import` target, not `types`.
    expect(await createWorkspaceLoad({ workspaceRoot })('@scope/gamma/server')).toMatchObject({
      surface: 'server',
    });
  });

  it('honours a custom packages directory', async () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'workspace-load-'));
    tempDirs.push(workspaceRoot);
    const directory = join(workspaceRoot, 'libs', 'delta');
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, 'package.json'),
      JSON.stringify({ name: 'delta', type: 'module', exports: { '.': './index.mjs' } }),
    );
    writeFileSync(join(directory, 'index.mjs'), `export const id = 'delta';\n`);

    expect(
      await createWorkspaceLoad({ workspaceRoot, packagesDir: 'libs' })('delta'),
    ).toMatchObject({ id: 'delta' });
  });

  it('throws when the specifier has no matching export', async () => {
    const workspaceRoot = createPackageWorkspace([
      {
        folder: 'gamma',
        packageJson: {
          name: '@scope/gamma',
          type: 'module',
          exports: { './server': './server.mjs' },
        },
        files: { 'server.mjs': `export const surface = 'server';\n` },
      },
    ]);

    await expect(createWorkspaceLoad({ workspaceRoot })('@scope/gamma/missing')).rejects.toThrow(
      /No "\.\/missing" export/,
    );
  });

  it('resolves the conditions-only `.` exports sugar', async () => {
    const workspaceRoot = createPackageWorkspace([
      {
        folder: 'epsilon',
        // No subpath keys: node treats this as the `.` export expressed as conditions.
        packageJson: {
          name: '@scope/epsilon',
          type: 'module',
          exports: { types: './index.d.ts', import: './index.mjs' },
        },
        files: { 'index.mjs': `export const id = 'epsilon';\n` },
      },
    ]);

    expect(await createWorkspaceLoad({ workspaceRoot })('@scope/epsilon')).toMatchObject({
      id: 'epsilon',
    });
  });

  it('throws a clear error when the package declares no exports', async () => {
    const workspaceRoot = createPackageWorkspace([
      { folder: 'zeta', packageJson: { name: 'zeta', type: 'module' }, files: {} },
    ]);

    await expect(createWorkspaceLoad({ workspaceRoot })('zeta')).rejects.toThrow(
      /declares no "exports"/,
    );
  });

  it('throws when the specifier cannot yield a package folder', async () => {
    const workspaceRoot = createPackageWorkspace([]);

    await expect(createWorkspaceLoad({ workspaceRoot })('@scope')).rejects.toThrow(
      /Cannot derive a workspace package folder/,
    );
  });

  it('refuses a specifier that would escape the packages directory', async () => {
    const workspaceRoot = createPackageWorkspace([]);

    await expect(createWorkspaceLoad({ workspaceRoot })('../secret')).rejects.toThrow(
      /Invalid workspace package folder/,
    );
  });
});

describe('resolveWorkspaceRoot', () => {
  it('walks up from a nested directory to the marker directory', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'workspace-root-'));
    tempDirs.push(workspaceRoot);
    mkdirSync(join(workspaceRoot, 'packages'), { recursive: true });
    const nested = join(workspaceRoot, 'packages', 'alpha', 'src');
    mkdirSync(nested, { recursive: true });

    expect(resolveWorkspaceRoot(nested)).toBe(workspaceRoot);
  });

  it('accepts a file URL and supports custom markers', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'workspace-root-'));
    tempDirs.push(workspaceRoot);
    mkdirSync(join(workspaceRoot, 'apps'), { recursive: true });
    mkdirSync(join(workspaceRoot, 'capabilities'), { recursive: true });
    const file = pathToFileURL(join(workspaceRoot, 'apps', 'host.mjs')).href;

    expect(resolveWorkspaceRoot(file, { markers: ['apps', 'capabilities'] })).toBe(workspaceRoot);
  });

  it('accepts a non-existent file path, walking up from its parent directory', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'workspace-root-'));
    tempDirs.push(workspaceRoot);
    mkdirSync(join(workspaceRoot, 'packages'), { recursive: true });
    // The file does not exist yet (e.g. a not-yet-emitted entry): resolution must
    // fall back to its containing directory rather than throw.
    const from = join(workspaceRoot, 'packages', 'alpha', 'dist', 'main.mjs');

    expect(resolveWorkspaceRoot(from)).toBe(workspaceRoot);
  });

  it('throws when no ancestor contains the markers', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'workspace-root-'));
    tempDirs.push(workspaceRoot);

    expect(() => resolveWorkspaceRoot(workspaceRoot, { markers: ['definitely-absent'] })).toThrow(
      /Workspace root not found/,
    );
  });
});

// `CAPABILITY_SELECTION_OPTIONS` is the anchor every adapter conformance test
// checks against, so it must name exactly the options this package accepts. Both
// directions matter: a new option missing from the list would never be demanded of
// an adapter, and a stale entry would demand something that no longer exists.
type DeclaredOption =
  | keyof Omit<CapabilitySelectionInput, 'workspaceRoot' | 'seed'>
  | keyof CapabilitySelectionSeed;
type OptionsMissingFromList = Exclude<DeclaredOption, CapabilitySelectionOption>;
type ListedButUndeclared = Exclude<CapabilitySelectionOption, DeclaredOption>;

describe('CAPABILITY_SELECTION_OPTIONS', () => {
  it('names exactly the options the selection input declares', () => {
    const conforms: [OptionsMissingFromList, ListedButUndeclared] extends [never, never]
      ? true
      : never = true;
    expect(conforms).toBe(true);
    expect(new Set(CAPABILITY_SELECTION_OPTIONS).size).toBe(CAPABILITY_SELECTION_OPTIONS.length);
  });
});

describe('composition report', () => {
  const providers = [
    {
      capabilityId: 'auth',
      selectedProviderId: 'auth-oidc',
      overriddenProviderIds: [],
      mode: 'default',
    },
    {
      capabilityId: 'pay',
      selectedProviderId: 'pay-stripe',
      overriddenProviderIds: ['pay-invoice'],
      mode: 'explicit',
    },
  ] as const;

  it('describes a resolution in descriptor terms and marks a winner that took no part', () => {
    const report = describeComposition({
      requested: ['shell'],
      selected: ['shell'],
      base: ['platform'],
      resolved: ['shell', 'auth-oidc', 'platform'],
      discovered: ['shell', 'auth-oidc', 'platform', 'pay-stripe', 'unused'],
      providers,
    });

    expect(report.resolved).toEqual(['auth-oidc', 'platform', 'shell']);
    // `pay-stripe` won a capability but is not in this composition. Reporting it as
    // the winner without saying so would credit a provider the run never built;
    // dropping it would hide a misconfiguration.
    expect(report.providers).toEqual([
      {
        capability: 'auth',
        provider: 'auth-oidc',
        overridden: [],
        mode: 'default',
        resolved: true,
      },
      {
        capability: 'pay',
        provider: 'pay-stripe',
        overridden: ['pay-invoice'],
        mode: 'explicit',
        resolved: false,
      },
    ]);
    expect(notResolved(report)).toEqual(['pay-stripe', 'unused']);
  });

  it('deduplicates and orders every id list, so two reports of one run compare equal', () => {
    const report = describeComposition({
      requested: ['shell', 'admin', 'shell'],
      resolved: ['shell', 'shell'],
      discovered: ['shell', 'admin', 'admin'],
    });

    expect(report.requested).toEqual(['admin', 'shell']);
    expect(report.resolved).toEqual(['shell']);
    expect(report.discovered).toEqual(['admin', 'shell']);
    expect(notResolved(report)).toEqual(['admin']);
  });

  it('renders every row a host shares, marking a default and a winner left out', () => {
    const report = describeComposition({
      requested: ['shell'],
      selected: ['shell'],
      base: ['platform'],
      resolved: ['shell', 'auth-oidc', 'platform'],
      discovered: ['shell', 'auth-oidc', 'platform', 'pay-stripe', 'unused'],
      providers,
    });

    expect(
      formatCompositionReport(report, { leadingRows: [{ label: 'Server', value: 'http://x' }] }),
    ).toEqual([
      '  Server    http://x',
      '  Requested shell',
      '  Selected  shell',
      '  Base      platform',
      '  auth      auth-oidc (default)',
      '  pay       pay-stripe (not in this composition)',
      '',
      '  Resolved 3/5 descriptors',
      '    auth-oidc, platform, shell',
      '',
      '  Not resolved 2 descriptors',
      '    pay-stripe, unused',
    ]);
  });

  it('says descriptor in the singular when the workspace holds exactly one', () => {
    const report = describeComposition({ resolved: ['shell'], discovered: ['shell'] });

    expect(formatCompositionReport(report)).toEqual([
      '  Requested (not given)',
      '',
      '  Resolved 1/1 descriptor',
      '    shell',
    ]);
  });

  it('hard-wraps the id list so a terminal never soft-wraps it', () => {
    const ids = ['shop-stationery', 'payment-invoice', 'payment-provider-stripe'];
    const report = describeComposition({ resolved: ids, discovered: ids });

    // Width 50 leaves 46 for ids: the first two fit on one line, the third does not.
    expect(formatCompositionReport(report, { width: 50 }).slice(-2)).toEqual([
      '    payment-invoice, payment-provider-stripe',
      '    shop-stationery',
    ]);
  });
});
