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
    // Conditions written directly are node's sugar for the `.` export.
    expect(resolvePackageExport({ import: './src/index.ts' }, '.')).toBe('./src/index.ts');
    expect(resolvePackageExport('./src/index.ts', '.')).toBe('./src/index.ts');
  });

  it('resolves nothing for a subpath or a shape that carries no target', () => {
    expect(resolvePackageExport({ '.': './src/index.ts' }, './web')).toBeUndefined();
    expect(resolvePackageExport('./src/index.ts', './web')).toBeUndefined();
    expect(resolvePackageExport(undefined, '.')).toBeUndefined();
    // A declaration condition is never a runtime target.
    expect(
      resolvePackageExport({ './web': { types: './dist/web.d.ts' } }, './web'),
    ).toBeUndefined();
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
