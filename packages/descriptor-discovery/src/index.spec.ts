import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { discoverDescriptors, expandNestedDescriptors } from './index';
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
});
