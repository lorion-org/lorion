import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Descriptor } from '@lorion-org/composition-graph';
import {
  conventionActivation,
  createCompositionRun,
  createWorkspaceCompositionRun,
  describeCompositionOrigins,
  createPackageSourceLoad,
  fileSurfaceConvention,
  formatCompositionOrigins,
  formatCompositionReport,
  resolvePackageSources,
  resolveSurfaceEntries,
  type CompositionRunInput,
  type PackageSource,
  type PackageSourceSnapshot,
} from './index';

// A shop workspace on disk, composed the way a host composes it: the package set is
// resolved once and every entry point of the run is handed the same resolution.
let root: string;

function camelCase(id: string): string {
  return id.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
}

function writeJson(path: string, content: unknown): void {
  mkdirSync(resolve(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(content, null, 2)}\n`);
}

function writeCapability(
  at: string,
  input: { id: string; scope?: string; web?: boolean } & Partial<Descriptor>,
): void {
  const { id, scope = '@acme', web, ...descriptor } = input;
  const directory = join(at, id);
  writeJson(join(directory, 'capability.json'), { id, version: '1.0.0', ...descriptor });
  writeJson(join(directory, 'package.json'), {
    name: `${scope}/${id}`,
    version: '1.0.0',
    private: true,
    type: 'module',
    ...(web ? { exports: { './web': './src/web.ts' } } : {}),
  });
  if (web) {
    mkdirSync(join(directory, 'src'), { recursive: true });
    writeFileSync(
      join(directory, 'src/web.ts'),
      `export const ${camelCase(id)}WebPlugin = { id: '${id}' };\n`,
    );
  }
}

const commerce: Descriptor = {
  id: 'commerce',
  version: '0.0.0',
  dependencies: { checkout: '^1.0.0' },
};
const storefront: Descriptor = {
  id: 'storefront',
  version: '0.0.0',
  dependencies: { 'shop-coffee': '^1.0.0' },
};

const activation = conventionActivation({
  web: fileSurfaceConvention({
    files: ['src/web.ts'],
    exportSubpath: './web',
    exportSuffix: 'WebPlugin',
    exists: existsSync,
    join,
  }),
});

function runInput(
  selected: readonly string[],
  overrides: Partial<CompositionRunInput> = {},
): CompositionRunInput {
  const snapshot = resolvePackageSources({ root });
  return {
    workspaceRoot: snapshot.workspaceRoot,
    descriptorPaths: [...snapshot.descriptorPaths],
    packageSources: snapshot.packageSources,
    virtualDescriptors: [commerce, storefront],
    seed: {
      selected: [...selected],
      baseDescriptors: ['commerce'],
      selectionSeed: false,
    },
    ...overrides,
  };
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lorion-run-'));
  writeJson(join(root, 'package.json'), {
    name: '@acme/shop',
    private: true,
    workspaces: ['packages/*'],
  });
  const packages = join(root, 'packages');
  writeCapability(packages, { id: 'payments' });
  writeCapability(packages, {
    id: 'payment-provider-stripe',
    providesFor: 'payments',
    defaultFor: 'payments',
  });
  writeCapability(packages, { id: 'payment-provider-invoice', providesFor: 'payments' });
  writeCapability(packages, {
    id: 'checkout',
    web: true,
    dependencies: { payments: '^1.0.0' },
    contributionPoints: ['payment-method'],
  });
  writeCapability(packages, { id: 'shop-coffee', web: true, dependencies: { checkout: '^1.0.0' } });
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { force: true, recursive: true });
});

describe('createCompositionRun', () => {
  it('resolves once and hands the same resolution to every entry point', () => {
    const run = createCompositionRun(runInput(['storefront']));

    // Each accessor is asked what it holds before it is asked whether it holds the same
    // thing twice: comparing a call with itself would accept an accessor that answers
    // nothing at all.
    expect(run.capabilities().map((capability) => capability.id)).toContain('checkout');
    expect(run.providerSelection().slots.map((slot) => slot.capabilityId)).toEqual(['payments']);
    expect(run.descriptors().map((entry) => entry.descriptor.id)).toContain('storefront');

    expect(run.capabilities()).toBe(run.capabilities());
    expect(run.providerSelection()).toBe(run.providerSelection());
    expect(run.descriptors()).toBe(run.descriptors());
    expect(run.report().resolved).toEqual(
      run
        .capabilities()
        .map((capability) => capability.id)
        .sort(),
    );
    expect(run.report().resolved).toEqual([
      'checkout',
      'commerce',
      'payment-provider-stripe',
      'payments',
      'shop-coffee',
      'storefront',
    ]);
  });

  it('names the package sources the composition selected, and only those', () => {
    const run = createCompositionRun(runInput(['storefront']));

    expect(run.selectedPackageSources().map((source) => source.name)).toEqual([
      '@acme/checkout',
      '@acme/payment-provider-stripe',
      '@acme/payments',
      '@acme/shop-coffee',
    ]);
  });

  it('reports what the run named, whether it named it as a list or on its command line', () => {
    const snapshot = resolvePackageSources({ root });
    const seeded = createCompositionRun({
      workspaceRoot: snapshot.workspaceRoot,
      descriptorPaths: [...snapshot.descriptorPaths],
      packageSources: snapshot.packageSources,
      virtualDescriptors: [commerce, storefront],
      seed: {
        baseDescriptors: ['commerce'],
        defaultSelection: ['storefront'],
        selectionSeed: { argv: ['--features=shop-coffee'], env: {}, cliKeys: ['features'] },
      },
    });

    expect(seeded.report().requested).toEqual(['shop-coffee']);
    expect(seeded.report().selected).toEqual(['shop-coffee']);
    expect(createCompositionRun(runInput(['storefront'])).report().requested).toEqual([
      'storefront',
    ]);
  });

  it('rejects a missing selected package when the run is created', () => {
    const input = runInput(['storefront']);
    expect(() =>
      createCompositionRun({
        ...input,
        packageSources: (input.packageSources ?? []).filter(
          (source) => source.name !== '@acme/checkout',
        ),
      }),
    ).toThrow(/Selected package "@acme\/checkout" is missing from the package sources/);
  });

  it.each(['directory', 'version', 'id'] as const)(
    'rejects a selected source with a different %s even without a matching descriptor path',
    (difference) => {
      const input = runInput(['storefront']);
      const packageSources = input.packageSources!.map((source) =>
        source.name === '@acme/checkout'
          ? {
              ...source,
              descriptorPath: join(root, 'other/capability.json'),
              ...(difference === 'directory' ? { root: join(root, 'other') } : {}),
              ...(difference === 'version' ? { descriptorVersion: '2.0.0' } : {}),
              ...(difference === 'id' ? { descriptorId: 'other' } : {}),
            }
          : source,
      );
      expect(() => createCompositionRun({ ...input, packageSources })).toThrow(/does not match/);
    },
  );

  it('states what a run without package sources cannot answer', () => {
    const { packageSources, ...withoutSources } = runInput(['storefront']);
    const run = createCompositionRun(withoutSources);

    expect(packageSources).toBeDefined();

    expect(run.report().resolved).toContain('checkout');
    expect(() => run.selectedPackageSources()).toThrow(/without `packageSources`/);
  });

  it('seals descriptor resolution when the run is created', () => {
    const input = runInput(['shop-coffee']);
    const run = createCompositionRun(input);
    writeJson(join(root, 'packages/shop-coffee/capability.json'), {
      id: 'shop-coffee',
      version: '2.0.0',
    });

    expect(run.capabilities().find((entry) => entry.id === 'shop-coffee')?.descriptor.version).toBe(
      '1.0.0',
    );
  });

  it('creates an atomic workspace run and rejects a separately stale package snapshot', () => {
    const run = createWorkspaceCompositionRun({
      root,
      seed: { selected: ['shop-coffee'], selectionSeed: false },
    });
    expect(
      run.selectedPackageSources().find((source) => source.descriptorId === 'shop-coffee'),
    ).toMatchObject({
      descriptorId: 'shop-coffee',
      descriptorVersion: '1.0.0',
    });

    const stale = resolvePackageSources({ root });
    writeJson(join(root, 'packages/shop-coffee/capability.json'), {
      id: 'shop-coffee',
      version: '1.1.0',
    });
    expect(() =>
      createCompositionRun({
        workspaceRoot: root,
        descriptorPaths: stale.descriptorPaths,
        packageSources: stale.packageSources,
        seed: { selected: ['shop-coffee'], selectionSeed: false },
      }),
    ).toThrow(/shop-coffee@1\.1\.0.*does not match package source/s);
  });

  it('uses every field of the descriptor document captured by the package snapshot', () => {
    const cache = new Map<string, PackageSourceSnapshot>();
    resolvePackageSources({ root, cache });
    writeJson(join(root, 'packages/shop-coffee/capability.json'), {
      id: 'shop-coffee',
      version: '1.0.0',
      dependencies: { missing: '^1.0.0' },
    });
    writeJson(join(root, 'packages/shop-coffee/package.json'), {
      name: '@changed/shop-coffee',
      version: '1.0.0',
      private: true,
    });

    const run = createWorkspaceCompositionRun({
      root,
      cache,
      seed: { selected: ['shop-coffee'], selectionSeed: false },
    });

    expect(run.capabilities().map((entry) => entry.id)).toContain('checkout');
    expect(run.capabilities().map((entry) => entry.id)).not.toContain('missing');
    expect(run.capabilities().find((entry) => entry.id === 'shop-coffee')?.packageName).toBe(
      '@acme/shop-coffee',
    );
  });

  it('keeps nested descriptors virtual while checking their containing package snapshot', () => {
    writeCapability(join(root, 'packages'), {
      id: 'profiles',
      bundles: [
        {
          id: 'anonymous-profile',
          version: '1.0.0',
          dependencies: { 'shop-coffee': '^1.0.0' },
        },
      ],
    });

    const run = createWorkspaceCompositionRun({
      root,
      seed: { selected: ['anonymous-profile'], selectionSeed: false },
    });
    const nested = run.descriptors().find((entry) => entry.descriptor.id === 'anonymous-profile');

    expect(nested).toMatchObject({ virtual: true, selected: true });
    expect(nested?.packageName).toBeUndefined();
    expect(run.capabilities().find((entry) => entry.id === 'anonymous-profile')?.packageName).toBe(
      '',
    );
  });

  it.each([
    { field: 'descriptor id', change: { descriptorId: 'other' } },
    { field: 'source directory', change: { root: '/other/source' } },
  ])('rejects a package snapshot with a stale $field', ({ change }) => {
    const snapshot = resolvePackageSources({ root });
    const packageSources = snapshot.packageSources.map((source) =>
      source.descriptorId === 'shop-coffee' ? { ...source, ...change } : source,
    );

    expect(() =>
      createCompositionRun({
        workspaceRoot: root,
        descriptorPaths: snapshot.descriptorPaths,
        packageSources,
        seed: { selected: ['shop-coffee'], selectionSeed: false },
      }),
    ).toThrow(/shop-coffee@1\.0\.0.*does not match package source/s);
  });

  it('exposes every versioned candidate with its physical source and winner state', () => {
    writeCapability(join(root, 'prototypes'), {
      id: 'shop-coffee',
      scope: '@prototype',
      version: '2.0.0',
    });
    const run = createWorkspaceCompositionRun({
      root,
      patterns: ['packages/*', 'prototypes/*'],
      virtualDescriptors: [
        { id: 'application', version: '1.0.0', dependencies: { 'shop-coffee': '^2.0.0' } },
      ],
      seed: { selected: ['application'], selectionSeed: false },
    });

    expect(
      run
        .descriptors()
        .filter((entry) => entry.descriptor.id === 'shop-coffee')
        .map((entry) => ({
          packageName: entry.packageName,
          selected: entry.selected,
          version: entry.descriptor.version,
        })),
    ).toEqual([
      { packageName: '@acme/shop-coffee', selected: false, version: '1.0.0' },
      { packageName: '@prototype/shop-coffee', selected: true, version: '2.0.0' },
    ]);
  });

  it('treats provider members of a directly selected virtual grouping as explicit', () => {
    const packages = join(root, 'packages');
    writeCapability(packages, { id: 'auth' });
    writeCapability(packages, { id: 'auth-session', providesFor: 'auth' });
    writeCapability(packages, { id: 'auth-anonymous', providesFor: 'auth' });
    writeCapability(packages, {
      id: 'application',
      dependencies: { 'auth-session': '^1.0.0' },
    });
    const snapshot = resolvePackageSources({ root });
    const run = createCompositionRun({
      workspaceRoot: root,
      descriptorPaths: snapshot.descriptorPaths,
      packageSources: snapshot.packageSources,
      virtualDescriptors: [
        {
          id: 'anonymous-profile',
          version: '1.0.0',
          dependencies: { 'auth-anonymous': '^1.0.0' },
        },
      ],
      seed: { selected: ['application', 'anonymous-profile'], selectionSeed: false },
    });

    expect(run.providerSelection().slots).toMatchObject([
      { capabilityId: 'auth', selectedProviderId: 'auth-anonymous', mode: 'explicit' },
    ]);
  });

  it('validates versioned contributions and projects only selected owners', () => {
    const run = createCompositionRun({
      workspaceRoot: root,
      descriptorPaths: [],
      virtualDescriptors: [
        { id: 'dashboard', version: '1.0.0', contributionPoints: ['panel'] },
        { id: 'dashboard', version: '2.0.0', contributionPoints: ['panel'] },
        { id: 'audit', version: '1.0.0', contributesTo: { dashboard: 'panel' } },
      ],
      seed: { selected: ['audit'], selectionSeed: false },
    });

    expect(run.contributionCatalog().edges).toHaveLength(2);
    expect(run.contributions().edges).toEqual([]);
  });
});

describe('surface entries', () => {
  it('projects a surface onto the files its packages declare', () => {
    const run = createCompositionRun(runInput(['storefront']));

    expect(run.surfaceEntries('web', activation)).toEqual([
      {
        capabilityId: 'checkout',
        packageName: '@acme/checkout',
        specifier: '@acme/checkout/web',
        exportName: 'checkoutWebPlugin',
        entryPath: join(root, 'packages/checkout/src/web.ts'),
      },
      {
        capabilityId: 'shop-coffee',
        packageName: '@acme/shop-coffee',
        specifier: '@acme/shop-coffee/web',
        exportName: 'shopCoffeeWebPlugin',
        entryPath: join(root, 'packages/shop-coffee/src/web.ts'),
      },
    ]);
  });

  it('orders the entries by capability, whatever order the capabilities arrive in', () => {
    const run = createCompositionRun(runInput(['storefront']));
    const reversed = [...run.capabilities()].reverse();
    const sources = resolvePackageSources({ root }).packageSources;

    expect(
      resolveSurfaceEntries({
        capabilities: reversed,
        surface: 'web',
        activation,
        packageSources: sources,
      }).map((entry) => entry.capabilityId),
    ).toEqual(['checkout', 'shop-coffee']);
  });

  it('names the capability whose package is missing, exports nothing or exports a missing file', () => {
    const run = createCompositionRun(runInput(['storefront']));
    const capabilities = run.capabilities();
    const sources = resolvePackageSources({ root }).packageSources;
    const project = (packageSources: readonly PackageSource[]): unknown =>
      resolveSurfaceEntries({ capabilities, surface: 'web', activation, packageSources });

    expect(() => project(sources.filter((source) => source.name !== '@acme/checkout'))).toThrow(
      /capability "checkout": package "@acme\/checkout" is missing from the package sources/,
    );

    expect(() =>
      project(
        sources.map((source) =>
          source.name === '@acme/checkout'
            ? { ...source, manifest: { ...source.manifest, exports: { '.': './src/index.ts' } } }
            : source,
        ),
      ),
    ).toThrow(/does not export "\.\/web"/);

    expect(() =>
      project(
        sources.map((source) =>
          source.name === '@acme/checkout'
            ? { ...source, manifest: { ...source.manifest, exports: { './web': './src/gone.ts' } } }
            : source,
        ),
      ),
    ).toThrow(/exports "\.\/web" to the missing file/);
  });
});

describe('loading from package sources', () => {
  it('composes a surface across two roots through one loader', async () => {
    // A second checkout beside the workspace, joined into the same snapshot.
    const core = join(root, '..', `core-${new Date().getTime()}`);
    writeJson(join(core, 'package.json'), {
      name: '@acme/core',
      private: true,
      workspaces: ['packages/*'],
    });
    writeCapability(join(core, 'packages'), {
      id: 'receipts',
      web: true,
      dependencies: { checkout: '^1.0.0' },
    });

    try {
      const snapshot = resolvePackageSources({ root, additionalRoots: [core] });
      const run = createCompositionRun({
        ...runInput(['storefront', 'receipts']),
        descriptorPaths: [...snapshot.descriptorPaths],
        packageSources: snapshot.packageSources,
      });

      const registered: string[] = [];
      const activated = await run.compose({
        surface: 'web',
        activation,
        register: (exportValue, capability) => {
          expect((exportValue as { id: string }).id).toBe(capability.id);
          registered.push(capability.id);
        },
      });

      expect(registered.sort()).toEqual(['checkout', 'receipts', 'shop-coffee']);
      // What compose returns is what it registered, in the order it registered it.
      expect(activated.map((capability) => capability.id)).toEqual(registered);
    } finally {
      rmSync(core, { force: true, recursive: true });
    }
  });

  it('leaves out a surface module that does not export the name the convention asks for', async () => {
    writeCapability(join(root, 'packages'), {
      id: 'shop-quiet',
      web: true,
      dependencies: { checkout: '^1.0.0' },
    });
    // The marker is there and the module loads; only the expected export is not in it.
    writeFileSync(
      join(root, 'packages/shop-quiet/src/web.ts'),
      "export const somethingElse = { id: 'shop-quiet' };\n",
    );

    const run = createCompositionRun(runInput(['storefront', 'shop-quiet']));
    const registered: string[] = [];
    const activated = await run.compose({
      surface: 'web',
      activation,
      register: (_exportValue, capability) => {
        registered.push(capability.id);
      },
    });

    expect(run.capabilities().map((capability) => capability.id)).toContain('shop-quiet');
    expect(registered).toEqual(['checkout', 'shop-coffee']);
    expect(activated.map((capability) => capability.id)).toEqual(registered);
  });

  it('names a specifier no package source carries', async () => {
    const load = createPackageSourceLoad(resolvePackageSources({ root }).packageSources);

    await expect(load('@acme/loyalty/web')).rejects.toThrow(
      /No package source found for "@acme\/loyalty\/web"/,
    );
    await expect(load('@acme/payments/web')).rejects.toThrow(/declares no "exports"/);
    // A target that leaves its own package is refused rather than imported.
    const escaping = resolvePackageSources({ root }).packageSources.map((source) =>
      source.name === '@acme/checkout'
        ? {
            ...source,
            manifest: { ...source.manifest, exports: { './web': '../payments/src/web.ts' } },
          }
        : source,
    );
    await expect(createPackageSourceLoad(escaping)('@acme/checkout/web')).rejects.toThrow(
      /escapes the workspace directory/,
    );
    await expect(load('@acme/checkout')).rejects.toThrow(/No "\." export resolves/);
  });
});

describe('origins', () => {
  it('reads from what the run decided to what followed from it', () => {
    const origins = createCompositionRun(runInput(['storefront'])).origins();

    expect(origins).toEqual({
      named: [],
      base: ['commerce'],
      groupings: ['storefront'],
      slots: [
        {
          capability: 'payments',
          chosen: ['payment-provider-stripe'],
          named: false,
          alternatives: ['payment-provider-invoice'],
        },
      ],
      viaGroupings: ['checkout', 'shop-coffee'],
      pulled: [],
    });
  });

  it('marks a slot the run chose itself and the loser it replaced', () => {
    const origins = createCompositionRun(
      runInput(['storefront', 'payment-provider-invoice']),
    ).origins();

    expect(origins.slots).toEqual([
      {
        capability: 'payments',
        chosen: ['payment-provider-invoice'],
        named: true,
        alternatives: ['payment-provider-stripe'],
      },
    ]);
    // The chosen provider reads in its slot row and nowhere else.
    expect(origins.named).toEqual([]);
  });

  it('separates what a run named from what its choice pulled in', () => {
    const origins = createCompositionRun(runInput(['shop-coffee'])).origins();

    expect(origins.named).toEqual(['shop-coffee']);
    expect(origins.groupings).toEqual([]);
    expect(origins.base).toEqual(['commerce']);
    // `checkout` arrives through the base grouping, `payments` through its slot row.
    expect(origins.viaGroupings).toEqual(['checkout']);
    expect(origins.pulled).toEqual([]);
  });

  it('reaches through a grouping that names another grouping', () => {
    // The run names one set, that set names another, and only the innermost one names
    // packages. Everything below the named set arrives through the equipment, and the
    // provider the inner set chose still reads as chosen by this run.
    const inner: Descriptor = {
      id: 'coffee-bar',
      version: '0.0.0',
      dependencies: { 'shop-coffee': '^1.0.0', 'payment-provider-invoice': '^1.0.0' },
    };
    const outer: Descriptor = {
      id: 'full-shop',
      version: '0.0.0',
      dependencies: { 'coffee-bar': '0.0.0' },
    };
    const run = createCompositionRun(
      runInput(['full-shop'], { virtualDescriptors: [commerce, inner, outer] }),
    );

    const origins = run.origins();

    expect(origins.groupings).toEqual(['coffee-bar', 'full-shop']);
    expect(origins.viaGroupings).toEqual(['checkout', 'shop-coffee']);
    expect(origins.slots).toEqual([
      {
        capability: 'payments',
        chosen: ['payment-provider-invoice'],
        named: true,
        alternatives: ['payment-provider-stripe'],
      },
    ]);
    expect(origins.pulled).toEqual([]);
  });

  it('reads a resolved id that no descriptor of the set describes', () => {
    // A host may resolve more than it hands over. Such an id needs no dependencies read
    // from it, whether the run named it or a grouping brought it, and it lands where an
    // unattributed id belongs.
    const origins = describeCompositionOrigins({
      selected: ['shop-coffee', 'bundle'],
      resolved: ['shop-coffee', 'ghost', 'bundle', 'brought-ghost'],
      groupings: ['bundle'],
      descriptors: [
        { id: 'shop-coffee', version: '1.0.0' },
        { id: 'bundle', version: '0.0.0', dependencies: { 'brought-ghost': '^1.0.0' } },
      ],
    });

    expect(origins.named).toEqual(['shop-coffee']);
    expect(origins.groupings).toEqual(['bundle']);
    expect(origins.viaGroupings).toEqual(['brought-ghost']);
    expect(origins.pulled).toEqual(['ghost']);
  });

  it('orders every row by id, whatever order the descriptors arrive in', () => {
    // Two reports of one composition compare as equal text, so no row may carry the
    // order its input happened to have.
    const origins = describeCompositionOrigins({
      selected: ['zeta', 'alpha', 'bundle'],
      base: ['zulu', 'alpha-base'],
      resolved: [
        'zeta',
        'alpha',
        'bundle',
        'zulu',
        'alpha-base',
        'zeta-member',
        'alpha-member',
        'payments',
        'zeta-provider',
      ],
      groupings: ['bundle'],
      descriptors: [
        { id: 'zeta', version: '1.0.0' },
        { id: 'alpha', version: '1.0.0' },
        {
          id: 'bundle',
          version: '0.0.0',
          dependencies: { 'zeta-member': '^1.0.0', 'alpha-member': '^1.0.0' },
        },
        { id: 'zulu', version: '1.0.0' },
        { id: 'alpha-base', version: '1.0.0' },
        { id: 'zeta-member', version: '1.0.0' },
        { id: 'alpha-member', version: '1.0.0' },
        { id: 'payments', version: '1.0.0' },
        { id: 'zeta-provider', version: '1.0.0', providesFor: 'payments' },
        { id: 'alpha-provider', version: '1.0.0', providesFor: 'payments' },
        { id: 'mid-provider', version: '1.0.0', providesFor: 'payments' },
      ],
    });

    expect(origins.named).toEqual(['alpha', 'zeta']);
    expect(origins.base).toEqual(['alpha-base', 'zulu']);
    expect(origins.viaGroupings).toEqual(['alpha-member', 'zeta-member']);
    expect(origins.slots[0]?.chosen).toEqual(['zeta-provider']);
    expect(origins.slots[0]?.alternatives).toEqual(['alpha-provider', 'mid-provider']);
  });

  it('follows a grouping that names itself once instead of forever', () => {
    const origins = describeCompositionOrigins({
      selected: ['outer'],
      resolved: ['outer', 'inner', 'shop-coffee'],
      groupings: ['outer', 'inner'],
      descriptors: [
        { id: 'outer', version: '0.0.0', dependencies: { inner: '^1.0.0' } },
        {
          id: 'inner',
          version: '0.0.0',
          dependencies: { outer: '^1.0.0', 'shop-coffee': '^1.0.0' },
        },
        { id: 'shop-coffee', version: '1.0.0' },
      ],
    });

    expect(origins.groupings).toEqual(['inner', 'outer']);
    expect(origins.viaGroupings).toEqual(['shop-coffee']);
    expect(origins.pulled).toEqual([]);
  });

  it('takes a provider slot from a name, not from an empty one', () => {
    const origins = describeCompositionOrigins({
      selected: ['stripe'],
      resolved: ['stripe', 'payments'],
      descriptors: [
        { id: 'payments', version: '1.0.0' },
        { id: 'stripe', version: '1.0.0', providesFor: ['', 'payments'] },
      ],
    });

    expect(origins.slots.map((slot) => slot.capability)).toEqual(['payments']);
  });

  it('renders a slot nothing filled as the outcome it is', () => {
    expect(
      formatCompositionOrigins({
        named: [],
        base: [],
        groupings: [],
        slots: [
          {
            capability: 'product-theme',
            chosen: [],
            named: false,
            alternatives: ['theme-classic'],
          },
          { capability: 'analytics', chosen: [], named: false, alternatives: [] },
        ],
        viaGroupings: [],
        pulled: [],
      }),
    ).toEqual([
      '  product-theme (unfilled; candidates: theme-classic)',
      '  analytics     (unfilled; no candidates)',
    ]);
  });

  it('renders the rows a run has, and leaves out the rows it has not', () => {
    const origins = createCompositionRun(runInput(['storefront'])).origins();

    expect(formatCompositionOrigins(origins)).toEqual([
      '  Base          commerce',
      '  Groupings     storefront',
      '  payments      payment-provider-stripe (not named by this run) (instead of payment-provider-invoice)',
      '  Via groupings checkout, shop-coffee',
    ]);
  });
});

it('selects the versioned source consistently for capabilities, surfaces, imports and reports', async () => {
  writeCapability(join(root, 'prototypes'), {
    id: 'shop-coffee',
    scope: '@prototype',
    version: '0.9.0',
    web: true,
  });
  const snapshot = resolvePackageSources({ root, patterns: ['packages/*', 'prototypes/*'] });
  const run = createCompositionRun({
    workspaceRoot: root,
    descriptorPaths: snapshot.descriptorPaths,
    packageSources: snapshot.packageSources,
    virtualDescriptors: [
      { id: 'legacy', version: '1.0.0', dependencies: { 'shop-coffee': '0.9.0' } },
    ],
    seed: { selected: ['legacy'], selectionSeed: false },
  });
  const coffee = run.capabilities().find((entry) => entry.id === 'shop-coffee');
  expect(coffee).toMatchObject({
    packageName: '@prototype/shop-coffee',
    directory: join(root, 'prototypes/shop-coffee'),
    descriptor: { version: '0.9.0' },
  });
  expect(run.report().resolvedVersions).toEqual({ legacy: '1.0.0', 'shop-coffee': '0.9.0' });
  expect(run.descriptors().filter((entry) => entry.descriptor.id === 'shop-coffee')).toHaveLength(
    2,
  );
  const entries = run.surfaceEntries('web', activation);
  expect(entries).toHaveLength(1);
  expect(entries[0]).toMatchObject({ packageName: '@prototype/shop-coffee' });
  writeFileSync(
    join(root, 'prototypes/shop-coffee/src/web.ts'),
    "export const shopCoffeeWebPlugin = { id: 'legacy-coffee' };\n",
  );
  expect(run.selectedPackageSources().map((source) => source.name)).toEqual([
    '@prototype/shop-coffee',
  ]);
  expect(entries[0]!.entryPath).toBe(join(root, 'prototypes/shop-coffee/src/web.ts'));
  const registered: unknown[] = [];
  await run.compose({
    surface: 'web',
    activation,
    register: (value, capability) => {
      registered.push(value);
      expect(capability.descriptor.version).toBe('0.9.0');
    },
  });
  expect(registered).toEqual([{ id: 'legacy-coffee' }]);
});

it('reports the resolved physical source when a losing version is virtual', () => {
  writeCapability(join(root, 'packages'), { id: 'feature', version: '2.0.0' });
  const run = createCompositionRun(
    runInput(['feature'], {
      virtualDescriptors: [{ id: 'feature', version: '1.0.0' }],
      seed: { selected: ['feature'], selectionSeed: false },
    }),
  );
  expect(run.capabilities()[0]?.packageName).toBe('@acme/feature');
  expect(run.origins()).toMatchObject({ named: ['feature'], groupings: [] });
});

it('uses the resolved provider catalog for origins regardless of candidate discovery order', () => {
  const providers: Descriptor[] = [
    { id: 'provider', version: '2.0.0', providesFor: 'a' },
    { id: 'provider', version: '1.0.0', providesFor: 'b' },
  ];
  for (const order of [providers, [...providers].reverse()]) {
    const run = createCompositionRun({
      workspaceRoot: root,
      descriptorPaths: [],
      virtualDescriptors: [{ id: 'a', version: '1.0.0' }, { id: 'b', version: '1.0.0' }, ...order],
      seed: { selected: ['a', 'b'], selectionSeed: false },
    });
    expect(run.providerSelection().slots).toMatchObject([
      { capabilityId: 'a', state: 'unfilled', candidateProviderIds: ['provider'] },
    ]);
    expect(run.origins().slots).toEqual([
      { capability: 'a', chosen: [], named: false, alternatives: ['provider'] },
    ]);
  }
});

describe('captured versioned run selection', () => {
  it('keeps CLI/env selection and its provenance after the environment changes', () => {
    vi.stubEnv('LORION_RUN_SELECTION', 'shop-coffee@1');
    const run = createWorkspaceCompositionRun({
      root,
      seed: { selectionSeed: { argv: [], envKeys: ['LORION_RUN_SELECTION'] } },
    });
    const report = run.report();
    const origins = run.origins();
    vi.stubEnv('LORION_RUN_SELECTION', 'checkout@99');
    expect(run.report()).toEqual(report);
    expect(run.origins()).toEqual(origins);
    expect(report.requested).toEqual(['shop-coffee@1']);
    expect(report.selected).toEqual(['shop-coffee']);
    const formatted = formatCompositionReport(report).join('\n');
    expect(formatted).toContain(`shop-coffee@1.0.0 from ${join(root, 'packages/shop-coffee')}`);
    expect(formatted).toContain('seed.selectionSeed requires shop-coffee@1');
    expect(report.versionSelection?.find((entry) => entry.id === 'shop-coffee')).toEqual({
      id: 'shop-coffee',
      version: '1.0.0',
      source: join(root, 'packages/shop-coffee'),
      requirements: [{ id: 'shop-coffee', range: '1', source: 'seed.selectionSeed' }],
    });
  });
  it('selects a version directly from a seed and retains each candidate source', () => {
    writeCapability(join(root, 'prototypes'), {
      id: 'shop-coffee',
      scope: '@prototype',
      version: '2.0.0',
    });
    const run = createWorkspaceCompositionRun({
      root,
      patterns: ['packages/*', 'prototypes/*'],
      seed: { selected: ['shop-coffee@1'], selectionSeed: false },
    });
    expect(run.report().resolvedVersions?.['shop-coffee']).toBe('1.0.0');
    expect(
      run
        .descriptors()
        .filter((entry) => entry.descriptor.id === 'shop-coffee')
        .map((entry) => entry.selected),
    ).toEqual([true, false]);
    expect(
      run.selectedPackageSources().find((source) => source.descriptorId === 'shop-coffee')?.name,
    ).toBe('@acme/shop-coffee');
  });
});
