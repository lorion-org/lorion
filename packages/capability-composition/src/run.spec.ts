import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Descriptor } from '@lorion-org/composition-graph';
import {
  conventionActivation,
  createCompositionRun,
  describeCompositionOrigins,
  createPackageSourceLoad,
  fileSurfaceConvention,
  formatCompositionOrigins,
  resolvePackageSources,
  resolveSurfaceEntries,
  type CompositionRunInput,
  type PackageSource,
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

  it('names a resolved package the given package set does not carry', () => {
    const input = runInput(['storefront']);
    const run = createCompositionRun({
      ...input,
      packageSources: (input.packageSources ?? []).filter(
        (source) => source.name !== '@acme/checkout',
      ),
    });

    expect(() => run.selectedPackageSources()).toThrow(
      /Selected package "@acme\/checkout" is missing from the package sources/,
    );
  });

  it('states what a run without package sources cannot answer', () => {
    const { packageSources, ...withoutSources } = runInput(['storefront']);
    const run = createCompositionRun(withoutSources);

    expect(packageSources).toBeDefined();

    expect(run.report().resolved).toContain('checkout');
    expect(() => run.selectedPackageSources()).toThrow(/without `packageSources`/);
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
      dependencies: { 'coffee-bar': '^1.0.0' },
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
