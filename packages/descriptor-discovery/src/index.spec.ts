import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import {
  discoverDescriptors,
  expandNestedDescriptors,
  findUp,
  loadBundleManifest,
  requirePackageName,
} from './index';
import { descriptorSchema } from './schema';

const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length) {
    const tempDir = tempDirs.pop();

    if (!tempDir) continue;

    rmSync(tempDir, {
      force: true,
      recursive: true,
    });
  }
});

function createTempDir(): string {
  const tempDir = mkdtempSync(join(tmpdir(), 'descriptor-discovery-'));

  tempDirs.push(tempDir);

  return tempDir;
}

describe('findUp', () => {
  it('returns the first ancestor directory the predicate accepts', () => {
    const root = createTempDir();
    mkdirSync(join(root, 'marker'), { recursive: true });
    const nested = join(root, 'a', 'b');
    mkdirSync(nested, { recursive: true });

    expect(findUp(nested, (dir) => existsSync(join(dir, 'marker')))).toBe(root);
  });

  it('returns undefined when no ancestor matches', () => {
    const root = createTempDir();

    expect(findUp(root, (dir) => existsSync(join(dir, 'definitely-absent')))).toBeUndefined();
  });
});

describe('expandNestedDescriptors', () => {
  it('returns a flat descriptor list and strips the nested field', () => {
    const descriptors = expandNestedDescriptors({
      rawDescriptor: {
        name: 'web-shell',
        version: '1.2.3',
        bundles: [
          {
            name: 'router',
            version: '1.0.0',
          },
        ],
      },
      fallbackId: 'fallback-id',
      idField: 'name',
      nestedField: 'bundles',
    });

    expect(descriptors).toEqual([
      {
        id: 'web-shell',
        name: 'web-shell',
        version: '1.2.3',
      },
      {
        id: 'router',
        name: 'router',
        version: '1.0.0',
      },
    ]);
  });

  it('rejects nested descriptors inside nested descriptors', () => {
    expect(() =>
      expandNestedDescriptors({
        rawDescriptor: {
          name: 'web-shell',
          bundles: [
            {
              name: 'router',
              bundles: [
                {
                  name: 'deep-node',
                },
              ],
            },
          ],
        },
        fallbackId: 'fallback-id',
        idField: 'name',
        nestedField: 'bundles',
      }),
    ).toThrow('Nested descriptors are not supported inside descriptor "router"');
  });

  it('requires explicit ids for nested descriptors', () => {
    expect(() =>
      expandNestedDescriptors({
        rawDescriptor: {
          name: 'web-shell',
          bundles: [
            {
              version: '1.0.0',
            },
          ],
        },
        fallbackId: 'fallback-id',
        idField: 'name',
        nestedField: 'bundles',
      }),
    ).toThrow('Nested descriptor in "web-shell" is missing a non-empty "name" field');
  });
});

describe('discoverDescriptors', () => {
  it('discovers flat and nested descriptors from disk', () => {
    const tempDir = createTempDir();
    const webShellDir = join(tempDir, 'web-shell');

    mkdirSync(webShellDir, { recursive: true });
    writeFileSync(
      join(webShellDir, 'descriptor.json'),
      JSON.stringify(
        {
          name: 'web-shell',
          version: '2.0.0',
          bundles: [
            {
              name: 'router',
              version: '1.0.0',
            },
            {
              name: 'dashboard',
              version: '1.1.0',
            },
          ],
        },
        null,
        2,
      ),
    );

    const discovered = discoverDescriptors({
      roots: [tempDir],
      descriptorFileName: 'descriptor.json',
      idField: 'name',
      nestedField: 'bundles',
    });

    expect(discovered.map((entry) => entry.id)).toEqual(['web-shell', 'router', 'dashboard']);
    expect(discovered.map((entry) => entry.descriptor)).toEqual([
      {
        id: 'web-shell',
        name: 'web-shell',
        version: '2.0.0',
      },
      {
        id: 'router',
        name: 'router',
        version: '1.0.0',
      },
      {
        id: 'dashboard',
        name: 'dashboard',
        version: '1.1.0',
      },
    ]);
  });

  it('discovers descriptors below the configured search depth', () => {
    const tempDir = createTempDir();
    const nestedDir = join(tempDir, 'core', 'kernel');

    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(
      join(nestedDir, 'feature.json'),
      JSON.stringify(
        {
          name: 'core/kernel',
          version: '1.0.0',
        },
        null,
        2,
      ),
    );

    expect(
      discoverDescriptors({
        roots: [tempDir],
        descriptorFileName: 'feature.json',
        idField: 'name',
      }),
    ).toEqual([]);

    expect(
      discoverDescriptors({
        roots: [tempDir],
        descriptorFileName: 'feature.json',
        idField: 'name',
        maxDepth: 2,
      }).map((entry) => entry.id),
    ).toEqual(['core/kernel']);
  });

  it('discovers descriptors from explicit path patterns', () => {
    const tempDir = createTempDir();
    const directDir = join(tempDir, 'features', 'crm');
    const nestedDir = join(tempDir, 'features', 'core', 'kernel');

    mkdirSync(directDir, { recursive: true });
    mkdirSync(nestedDir, { recursive: true });
    writeFileSync(
      join(directDir, 'feature.json'),
      JSON.stringify(
        {
          name: 'crm',
          version: '1.0.0',
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(nestedDir, 'feature.json'),
      JSON.stringify(
        {
          name: 'core/kernel',
          version: '1.0.0',
        },
        null,
        2,
      ),
    );

    const discovered = discoverDescriptors({
      cwd: tempDir,
      descriptorPaths: ['features/*/feature.json', 'features/*/*/feature.json'],
      idField: 'name',
    });

    expect(discovered.map((entry) => entry.id)).toEqual(['core/kernel', 'crm']);
  });

  it('validates descriptor files with a configured schema before normalization', () => {
    const tempDir = createTempDir();
    const featureDir = join(tempDir, 'features', 'crm');

    mkdirSync(featureDir, { recursive: true });
    writeFileSync(
      join(featureDir, 'feature.json'),
      JSON.stringify(
        {
          name: 'crm',
          version: '1.0.0',
        },
        null,
        2,
      ),
    );

    expect(() =>
      discoverDescriptors({
        cwd: tempDir,
        descriptorPaths: ['features/*/feature.json'],
        validation: {
          schema: descriptorSchema,
        },
      }),
    ).toThrow('Descriptor schema validation failed.');
  });

  it('rejects removed providerPreferences metadata with the shared schema', () => {
    const tempDir = createTempDir();
    const featureDir = join(tempDir, 'features', 'web');

    mkdirSync(featureDir, { recursive: true });
    writeFileSync(
      join(featureDir, 'feature.json'),
      JSON.stringify({
        id: 'web',
        version: '1.0.0',
        providerPreferences: { auth: 'keycloak' },
      }),
    );

    expect(() =>
      discoverDescriptors({
        cwd: tempDir,
        descriptorPaths: ['features/*/feature.json'],
        validation: { schema: descriptorSchema },
      }),
    ).toThrow(/Descriptor schema validation failed.*providerPreferences/s);
  });
});

describe('requirePackageName', () => {
  it('returns the package name when it is a string', () => {
    expect(requirePackageName({ name: '@acme/shops' }, '/caps/shops/package.json')).toBe(
      '@acme/shops',
    );
  });

  it('throws with the package path when the name is missing or not a string', () => {
    expect(() => requirePackageName({}, '/caps/shops/package.json')).toThrow(
      /missing "name": \/caps\/shops\/package\.json/,
    );
    expect(() => requirePackageName({ name: 42 }, '/caps/shops/package.json')).toThrow(
      /missing "name"/,
    );
  });
});

describe('loadBundleManifest', () => {
  it('reads the nested bundle descriptors as virtual descriptors', () => {
    const root = createTempDir();
    writeFileSync(
      join(root, 'bundles.json'),
      JSON.stringify({
        bundles: [
          { id: 'base', version: '0.0.0', dependencies: { ui: '^1.0.0', auth: '^1.0.0' } },
          { id: 'shop', version: '0.0.0', dependencies: { catalog: '^1.0.0', checkout: '^1.0.0' } },
        ],
      }),
    );

    expect(loadBundleManifest({ cwd: root })).toEqual([
      { id: 'base', version: '0.0.0', dependencies: { ui: '^1.0.0', auth: '^1.0.0' } },
      { id: 'shop', version: '0.0.0', dependencies: { catalog: '^1.0.0', checkout: '^1.0.0' } },
    ]);
  });

  it('rejects a manifest key that is not a bundle declaration', () => {
    const root = createTempDir();
    writeFileSync(
      join(root, 'bundles.json'),
      JSON.stringify({
        base: 'base',
        default: 'base',
        bundles: [{ id: 'base', version: '0.0.0' }],
      }),
    );

    // A manifest declares descriptors only. A seed belongs to the run and is named
    // by the host, so a run-wide key here is reported rather than ignored.
    expect(() => loadBundleManifest({ cwd: root })).toThrow(/additionalProperties/);
  });

  it('accepts a manifest pointing at its own schema', () => {
    const root = createTempDir();
    writeFileSync(
      join(root, 'bundles.json'),
      JSON.stringify({
        $schema: 'https://lorion.dev/schemas/bundles.schema.json',
        bundles: [{ id: 'base', version: '0.0.0' }],
      }),
    );

    expect(loadBundleManifest({ cwd: root })).toEqual([{ id: 'base', version: '0.0.0' }]);
  });

  it('requires a bundle version, as the same grouping nested in a descriptor does', () => {
    const root = createTempDir();
    writeFileSync(
      join(root, 'bundles.json'),
      JSON.stringify({ bundles: [{ id: 'base', dependencies: { ui: '^1.0.0' } }] }),
    );

    expect(() => loadBundleManifest({ cwd: root })).toThrow(/required.*version/s);
  });

  it('discovers the manifest by walking up from a nested start directory', () => {
    const root = createTempDir();
    writeFileSync(
      join(root, 'bundles.json'),
      JSON.stringify({ bundles: [{ id: 'base', version: '0.0.0' }] }),
    );
    const nested = join(root, 'web', 'src');
    mkdirSync(nested, { recursive: true });

    expect(loadBundleManifest({ cwd: nested })).toEqual([{ id: 'base', version: '0.0.0' }]);
  });

  it('throws when a bundle is missing an id', () => {
    const root = createTempDir();
    writeFileSync(join(root, 'bundles.json'), JSON.stringify({ bundles: [{ dependencies: {} }] }));

    expect(() => loadBundleManifest({ cwd: root })).toThrow(/missing a non-empty "id"/);
  });

  it('throws when no manifest is found upward', () => {
    const root = createTempDir();
    expect(() => loadBundleManifest({ cwd: root })).toThrow(/not found/);
  });
});

it('validates concrete SemVer versions separately from dependency constraints', () => {
  const root = createTempDir();
  const file = join(root, 'capability.json');
  for (const version of ['1.0.0', '1.2.0-beta.1+build.7']) {
    writeFileSync(
      file,
      JSON.stringify({ id: 'feature', version, dependencies: { base: '^1.0.0-beta.1' } }),
    );
    expect(
      discoverDescriptors({
        cwd: root,
        descriptorPaths: ['capability.json'],
        validation: { schema: descriptorSchema },
      })[0]?.descriptor.version,
    ).toBe(version);
  }
  for (const version of ['^1.0.0', '~1.0.0', '01.0.0', '1.0.0-01']) {
    writeFileSync(file, JSON.stringify({ id: 'feature', version }));
    expect(() =>
      discoverDescriptors({
        cwd: root,
        descriptorPaths: ['capability.json'],
        validation: { schema: descriptorSchema },
      }),
    ).toThrow('schema validation failed');
  }
});

it.each([
  '',
  ' ',
  '*',
  '1.x',
  '~1.2',
  '^0.2.3',
  '>=1.0.0 <2.0.0',
  '1.0.0 || 2.0.0',
  '1.0.0 - 2.0.0',
  '^2.0.0-beta.1',
])('accepts the same npm dependency range in files and bundles: %j', (range) => {
  const root = createTempDir();
  const descriptor = { id: 'feature', version: '1.0.0', dependencies: { lib: range } };
  writeFileSync(join(root, 'capability.json'), JSON.stringify(descriptor));
  writeFileSync(join(root, 'bundles.json'), JSON.stringify({ bundles: [descriptor] }));
  expect(
    discoverDescriptors({
      cwd: root,
      descriptorPaths: ['capability.json'],
      validation: { schema: descriptorSchema },
    })[0]?.descriptor.dependencies,
  ).toEqual({ lib: range });
  expect(loadBundleManifest({ cwd: root })[0]?.dependencies).toEqual({ lib: range });
});

it.each(['banana', 'beta', '^', '1.0.0-01'])(
  'rejects malformed dependency ranges in nested descriptors and bundles: %j',
  (range) => {
    const root = createTempDir();
    const descriptor = {
      id: 'outer',
      version: '1.0.0',
      bundles: [{ id: 'inner', version: '1.0.0', dependencies: { lib: range } }],
    };
    writeFileSync(join(root, 'capability.json'), JSON.stringify(descriptor));
    writeFileSync(join(root, 'bundles.json'), JSON.stringify({ bundles: [descriptor] }));
    for (const read of [
      () =>
        discoverDescriptors({
          cwd: root,
          descriptorPaths: ['capability.json'],
          validation: { schema: descriptorSchema },
        }),
      () => loadBundleManifest({ cwd: root }),
    ]) {
      let failure: unknown;
      try {
        read();
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain('semver-range');
      expect((failure as Error).message).toContain('/bundles/0/dependencies/lib');
    }
  },
);
