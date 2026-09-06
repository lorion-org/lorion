import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  discoverDescriptors,
  findWorkspaceRoot,
  resolvePackageEntries,
  resolvePackageExport,
  resolvePackageSources,
  type PackageSourceSnapshot,
} from './index';

// Real directories rather than a mocked filesystem: what this reads is the
// filesystem, and a mock would only restate the expectations.
let root: string;

function write(path: string, content: unknown): void {
  const full = join(root, path);
  mkdirSync(resolve(full, '..'), { recursive: true });
  writeFileSync(full, `${JSON.stringify(content, null, 2)}\n`);
}

function writePackage(
  path: string,
  manifest: Record<string, unknown>,
  descriptor?: Record<string, unknown>,
): void {
  write(`${path}/package.json`, manifest);
  if (descriptor) write(`${path}/capability.json`, descriptor);
}

// A shop workspace: two capability packages, one package without a descriptor.
function writeShopWorkspace(): void {
  write('package.json', { name: '@acme/shop', private: true, workspaces: ['packages/*'] });
  writePackage(
    'packages/checkout',
    { name: '@acme/checkout', exports: { '.': './src/index.ts', './web': './src/web.ts' } },
    { id: 'checkout', version: '1.0.0', dependencies: { payments: '^1.0.0' } },
  );
  writePackage(
    'packages/payments',
    { name: '@acme/payments', exports: { '.': { import: './src/index.ts' } } },
    { id: 'payments', version: '1.0.0' },
  );
  writePackage('packages/tooling', { name: '@acme/tooling' });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'lorion-workspace-'));
});

afterEach(() => {
  rmSync(root, { force: true, recursive: true });
});

describe('resolvePackageSources', () => {
  it('reads the package set the workspace patterns name', () => {
    writeShopWorkspace();

    const snapshot = resolvePackageSources({ root });

    expect(snapshot.packageSources.map((source) => source.name)).toEqual([
      '@acme/checkout',
      '@acme/payments',
      '@acme/tooling',
    ]);
    expect(snapshot.packageSources[0]?.descriptorId).toBe('checkout');
    expect(snapshot.packageSources[2]?.descriptorPath).toBeUndefined();
    expect(snapshot.descriptorPaths.map((path) => path.split(sep).join('/'))).toEqual([
      'packages/checkout/capability.json',
      'packages/payments/capability.json',
    ]);
  });

  it('reads the object form of the workspaces field', () => {
    writeShopWorkspace();
    write('package.json', {
      name: '@acme/shop',
      private: true,
      workspaces: { packages: ['packages/*'], catalog: { react: '^19.0.0' } },
    });

    expect(resolvePackageSources({ root }).packageSources).toHaveLength(3);
  });

  it('takes patterns the caller names instead of the declared ones', () => {
    writeShopWorkspace();
    writePackage(
      'capabilities/shop-coffee',
      { name: '@acme/shop-coffee' },
      {
        id: 'shop-coffee',
        version: '1.0.0',
      },
    );

    const snapshot = resolvePackageSources({ root, patterns: ['capabilities/*'] });

    expect(snapshot.packageSources.map((source) => source.name)).toEqual(['@acme/shop-coffee']);
  });

  it('finds the workspace root upward from a file and from a file URL', () => {
    writeShopWorkspace();

    expect(findWorkspaceRoot(join(root, 'packages/checkout/src/web.ts'))).toBe(root);
    expect(findWorkspaceRoot(pathToFileURL(join(root, 'packages/payments')).href)).toBe(root);
    expect(resolvePackageSources({ from: join(root, 'packages/checkout') }).workspaceRoot).toBe(
      root,
    );
  });

  it('names the two packages that claim one package name', () => {
    writeShopWorkspace();
    writePackage('packages/checkout-copy', { name: '@acme/checkout' });

    expect(() => resolvePackageSources({ root })).toThrow(/duplicate workspace package name/);
  });

  it('names both files that declare one descriptor id', () => {
    writeShopWorkspace();
    writePackage(
      'packages/checkout-next',
      { name: '@acme/checkout-next' },
      {
        id: 'checkout',
        version: '1.0.0',
      },
    );

    expect(() => resolvePackageSources({ root })).toThrow(
      /Duplicate descriptor id "checkout" declared in .*checkout.capability.json and .*checkout-next.capability.json/,
    );
  });

  it('rejects a package without a name and a descriptor without an id', () => {
    writeShopWorkspace();
    writePackage('packages/nameless', { private: true });
    expect(() => resolvePackageSources({ root })).toThrow(/must declare a package name/);

    write('packages/nameless/package.json', { name: '@acme/nameless' });
    write('packages/nameless/capability.json', { id: '', version: '1.0.0' });
    expect(() => resolvePackageSources({ root })).toThrow(/"id" must be a non-empty string/);
  });

  it('names a descriptor that no manifest accompanies', () => {
    writeShopWorkspace();
    write('packages/loyalty/capability.json', { id: 'loyalty', version: '1.0.0' });

    expect(() => resolvePackageSources({ root })).toThrow(
      /loyalty.capability.json: no "package.json" beside this descriptor/,
    );
  });

  it('reads a descriptor that declares no id as a package without one', () => {
    writeShopWorkspace();
    writePackage('packages/loyalty', { name: '@acme/loyalty' }, { version: '1.0.0' });

    const source = resolvePackageSources({ root }).packageSources.find(
      (entry) => entry.name === '@acme/loyalty',
    );

    expect(source?.descriptorPath).toBeDefined();
    expect(source?.descriptorId).toBeUndefined();
  });

  it('ignores workspace patterns that name nothing', () => {
    writeShopWorkspace();
    write('package.json', {
      name: '@acme/shop',
      private: true,
      workspaces: ['packages/*', '', 42, null],
    });

    expect(resolvePackageSources({ root }).packageSources).toHaveLength(3);
  });

  it('rejects a manifest or a descriptor that is not a JSON object', () => {
    writeShopWorkspace();
    for (const content of [['@acme/checkout'], 'a name', 42, null]) {
      write('packages/checkout/package.json', content);
      expect(() => resolvePackageSources({ root })).toThrow(/expected a JSON object/);
    }

    write('packages/checkout/package.json', { name: '@acme/checkout' });
    write('packages/checkout/capability.json', ['checkout']);
    expect(() => resolvePackageSources({ root })).toThrow(/expected a JSON object/);
  });

  it('rejects a descriptor id that is not a name', () => {
    writeShopWorkspace();
    for (const id of ['', 42, null, {}]) {
      write('packages/checkout/capability.json', { id, version: '1.0.0' });
      expect(() => resolvePackageSources({ root })).toThrow(/"id" must be a non-empty string/);
    }
  });

  it('starts the upward walk at a directory, and at the parent of anything else', () => {
    writeShopWorkspace();
    write('packages/checkout/src/web.ts', 'export const web = 1;');

    // A directory is where the walk starts; a file, and a path that is not there at all,
    // start at the directory holding it.
    expect(findWorkspaceRoot(join(root, 'packages/checkout'))).toBe(root);
    expect(findWorkspaceRoot(join(root, 'packages/checkout/src/web.ts'))).toBe(root);
    expect(findWorkspaceRoot(join(root, 'packages/checkout/src/does-not-exist.ts'))).toBe(root);
  });

  it('says when no manifest above a path declares a workspace', () => {
    const alone = mkdtempSync(join(tmpdir(), 'lorion-alone-'));

    try {
      expect(() => findWorkspaceRoot(alone)).toThrow(/No workspace root found/);
    } finally {
      rmSync(alone, { force: true, recursive: true });
    }
  });

  it('states which root declares no patterns at all', () => {
    write('package.json', { name: '@acme/shop', private: true });

    expect(() => resolvePackageSources({ root })).toThrow(/declares no workspace patterns/);
  });
});

describe('a second root joined into the snapshot', () => {
  beforeEach(() => {
    writeShopWorkspace();
    // The second checkout, beside the workspace rather than inside it.
    write('../core/package.json', {
      name: '@acme/core',
      private: true,
      workspaces: ['packages/*'],
    });
    writePackage(
      '../core/packages/receipts',
      { name: '@acme/receipts', exports: { './web': './src/web.ts' } },
      { id: 'receipts', version: '1.0.0' },
    );
    writePackage(
      '../core/packages/payments',
      { name: '@acme/payments' },
      {
        id: 'payments-core',
        version: '1.0.0',
      },
    );
  });

  it('joins its packages and leaves a name the asking workspace already carries', () => {
    const snapshot = resolvePackageSources({ root, additionalRoots: ['../core'] });

    expect(snapshot.packageSources.map((source) => source.name)).toEqual([
      '@acme/checkout',
      '@acme/payments',
      '@acme/receipts',
      '@acme/tooling',
    ]);
    // The joined `@acme/payments` is dropped whole, descriptor included.
    expect(snapshot.packageSources.map((source) => source.descriptorId)).toEqual([
      'checkout',
      'payments',
      'receipts',
      undefined,
    ]);
  });

  it('reaches the joined descriptors through the paths it reports', () => {
    const snapshot = resolvePackageSources({ root, additionalRoots: ['../core'] });

    const discovered = discoverDescriptors({
      cwd: snapshot.workspaceRoot,
      descriptorPaths: [...snapshot.descriptorPaths],
      validation: false,
    });

    expect(discovered.map((entry) => entry.id).sort()).toEqual([
      'checkout',
      'payments',
      'receipts',
    ]);
  });

  it('keeps one name once when two joined roots carry it', () => {
    write('../mirror/package.json', {
      name: '@acme/mirror',
      private: true,
      workspaces: ['packages/*'],
    });
    writePackage('../mirror/packages/receipts', { name: '@acme/receipts' });

    const snapshot = resolvePackageSources({ root, additionalRoots: ['../core', '../mirror'] });
    const names = snapshot.packageSources.map((source) => source.name);

    expect(names.filter((name) => name === '@acme/receipts')).toHaveLength(1);
    // The first root that carries the name keeps it, descriptor included.
    expect(
      snapshot.packageSources.find((source) => source.name === '@acme/receipts')?.descriptorId,
    ).toBe('receipts');
  });

  it('takes patterns per joined root', () => {
    writePackage(
      '../core/plugins/loyalty',
      { name: '@acme/loyalty' },
      {
        id: 'loyalty',
        version: '1.0.0',
      },
    );

    const snapshot = resolvePackageSources({
      root,
      additionalRoots: [{ root: '../core', patterns: ['plugins/*'] }],
    });

    expect(snapshot.packageSources.map((source) => source.name)).toContain('@acme/loyalty');
    expect(snapshot.packageSources.map((source) => source.name)).not.toContain('@acme/receipts');
  });

  it('accepts a pattern that leaves the root when that checkout is there', () => {
    // Reached as one root, so the two patterns are one vocabulary and a name may not
    // appear twice. That is what tells this apart from a joined root, where the asking
    // workspace keeps a name it already carries.
    writePackage('../reachable/packages/loyalty', { name: '@acme/loyalty' });
    write('package.json', {
      name: '@acme/shop',
      private: true,
      workspaces: ['packages/*', '../reachable/packages/*'],
    });

    expect(resolvePackageSources({ root }).packageSources.map((source) => source.name)).toContain(
      '@acme/loyalty',
    );
  });

  it('leaves a pattern inside the root unchecked, whether or not it names anything yet', () => {
    writeShopWorkspace();
    write('package.json', {
      name: '@acme/shop',
      private: true,
      workspaces: ['packages/*', 'not-created-yet/*'],
    });

    expect(() => resolvePackageSources({ root })).not.toThrow();
  });

  it('names a pattern that points at a checkout which is not there', () => {
    write('package.json', {
      name: '@acme/shop',
      private: true,
      workspaces: ['packages/*', '../missing/packages/*'],
    });

    expect(() => resolvePackageSources({ root })).toThrow(
      /names the checkout ".*missing.packages", which does not exist/,
    );
  });
});

describe('snapshot reuse', () => {
  it('reads the workspace once per root when a cache is passed, and every time without one', () => {
    writeShopWorkspace();
    const cache = new Map<string, PackageSourceSnapshot>();

    const first = resolvePackageSources({ root, cache });
    writePackage('packages/loyalty', { name: '@acme/loyalty' });

    expect(resolvePackageSources({ root, cache })).toBe(first);
    expect(resolvePackageSources({ root }).packageSources).toHaveLength(4);
  });

  it('tells one snapshot from another by the roots it joins', () => {
    writeShopWorkspace();
    write('../core/package.json', {
      name: '@acme/core',
      private: true,
      workspaces: ['packages/*'],
    });
    writePackage('../core/packages/receipts', { name: '@acme/receipts' });
    const cache = new Map<string, PackageSourceSnapshot>();

    const own = resolvePackageSources({ root, cache });
    const joined = resolvePackageSources({ root, additionalRoots: ['../core'], cache });

    expect(own.packageSources.map((source) => source.name)).not.toContain('@acme/receipts');
    expect(joined.packageSources.map((source) => source.name)).toContain('@acme/receipts');
  });

  it('tells one joined root from the same root read through other patterns', () => {
    writeShopWorkspace();
    write('../core/package.json', {
      name: '@acme/core',
      private: true,
      workspaces: ['packages/*'],
    });
    writePackage('../core/packages/receipts', { name: '@acme/receipts' });
    writePackage('../core/plugins/loyalty', { name: '@acme/loyalty' });
    const cache = new Map<string, PackageSourceSnapshot>();

    const packages = resolvePackageSources({
      root,
      additionalRoots: [{ root: '../core', patterns: ['packages/*'] }],
      cache,
    });
    const plugins = resolvePackageSources({
      root,
      additionalRoots: [{ root: '../core', patterns: ['plugins/*'] }],
      cache,
    });

    expect(packages.packageSources.map((source) => source.name)).toContain('@acme/receipts');
    expect(plugins.packageSources.map((source) => source.name)).toContain('@acme/loyalty');
    expect(plugins.packageSources.map((source) => source.name)).not.toContain('@acme/receipts');
  });

  it('answers the question that was asked, not the one the root was asked before', () => {
    writeShopWorkspace();
    writePackage('capabilities/shop-coffee', { name: '@acme/shop-coffee' });
    const cache = new Map<string, PackageSourceSnapshot>();

    const declared = resolvePackageSources({ root, cache });
    const named = resolvePackageSources({ root, patterns: ['capabilities/*'], cache });

    expect(declared.packageSources.map((source) => source.name)).toContain('@acme/checkout');
    expect(named.packageSources.map((source) => source.name)).toEqual(['@acme/shop-coffee']);
  });
});

describe('resolvePackageExport', () => {
  it('follows the conditions a loader follows', () => {
    expect(resolvePackageExport({ '.': './src/index.ts' }, '.')).toBe('./src/index.ts');
    expect(resolvePackageExport({ './web': { import: './src/web.ts' } }, './web')).toBe(
      './src/web.ts',
    );
    expect(
      resolvePackageExport(
        { './web': { require: './dist/web.cjs', default: './src/web.ts' } },
        './web',
      ),
    ).toBe('./dist/web.cjs');
    // The order is the contract: import before require before default, and a nested
    // condition object is followed the same way.
    expect(
      resolvePackageExport(
        {
          './web': { require: './dist/web.cjs', import: './src/web.ts', default: './fallback.ts' },
        },
        './web',
      ),
    ).toBe('./src/web.ts');
    expect(
      resolvePackageExport({ './web': { import: { default: './src/web.ts' } } }, './web'),
    ).toBe('./src/web.ts');
    // A condition the resolution does not know is skipped rather than followed.
    expect(
      resolvePackageExport(
        { './web': { browser: './browser.ts', default: './src/web.ts' } },
        './web',
      ),
    ).toBe('./src/web.ts');
    // Conditions written directly are node's sugar for the `.` export.
    expect(resolvePackageExport({ import: './src/index.ts' }, '.')).toBe('./src/index.ts');
    expect(resolvePackageExport('./src/index.ts', '.')).toBe('./src/index.ts');
  });

  it('falls through a condition whose value carries no target', () => {
    // A condition that is present but resolves to nothing is not an answer: the next one
    // in the order decides, and only an exhausted list means "no target".
    expect(
      resolvePackageExport({ './web': { import: {}, default: './src/web.ts' } }, './web'),
    ).toBe('./src/web.ts');
    expect(resolvePackageExport({ './web': { import: {}, require: {} } }, './web')).toBeUndefined();
  });

  it('resolves nothing for a subpath or a shape that carries no target', () => {
    expect(resolvePackageExport({ '.': './src/index.ts' }, './web')).toBeUndefined();
    expect(resolvePackageExport('./src/index.ts', './web')).toBeUndefined();
    expect(resolvePackageExport(undefined, '.')).toBeUndefined();
    // A declaration condition is never a runtime target.
    expect(
      resolvePackageExport({ './web': { types: './dist/web.d.ts' } }, './web'),
    ).toBeUndefined();
    // A subpath map answers for the subpaths it declares and for no other, and a shape
    // that is neither a target nor a map answers for nothing at all.
    expect(resolvePackageExport({ './web': './src/web.ts' }, '.')).toBeUndefined();
    expect(resolvePackageExport({ './web': ['./src/web.ts'] }, './web')).toBeUndefined();
    expect(resolvePackageExport(42, '.')).toBeUndefined();
    expect(resolvePackageExport(null, '.')).toBeUndefined();
  });
});

describe('resolvePackageEntries', () => {
  it('addresses the entries a package set declares and skips the rest', () => {
    writeShopWorkspace();
    const { packageSources } = resolvePackageSources({ root });

    expect(resolvePackageEntries(packageSources, ['./web'])).toEqual([
      {
        packageName: '@acme/checkout',
        subpath: './web',
        specifier: '@acme/checkout/web',
        entryPath: join(root, 'packages/checkout/src/web.ts'),
      },
    ]);
    expect(
      resolvePackageEntries(packageSources, ['.', './web']).map((entry) => entry.specifier),
    ).toEqual(['@acme/checkout', '@acme/checkout/web', '@acme/payments']);
  });
});
