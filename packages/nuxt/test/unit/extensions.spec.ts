import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createNuxtProviderSelectionRuntimeConfig,
  createNuxtExtensionBootstrap,
  createNuxtExtensionLayerPaths,
  resolveExtensionSelection,
} from '../../src/extensions';

let tempRoot: string | undefined;

function createTempRoot(): string {
  tempRoot = mkdtempSync(join(tmpdir(), 'lorion-nuxt-extensions-'));

  return tempRoot;
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

function createExtension(
  root: string,
  name: string,
  descriptor: Record<string, unknown>,
  folders: string[] = [],
): void {
  const dir = join(root, 'extensions', name);

  mkdirSync(dir, { recursive: true });
  writeJson(join(dir, 'extension.json'), descriptor);

  for (const folder of folders) {
    mkdirSync(join(dir, folder), { recursive: true });
  }
}

describe('Nuxt extension bootstrap', () => {
  afterEach(() => {
    if (!tempRoot) return;

    rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = undefined;
  });

  it('uses configured selection before default selection', () => {
    expect(
      resolveExtensionSelection({
        selected: 'settings',
        defaultSelection: 'default',
      }),
    ).toEqual(['settings']);
  });

  it('resolves default bundles but mounts only extensions with app or server folders', () => {
    const root = createTempRoot();

    createExtension(root, 'bundles', {
      id: 'bundles',
      version: '1.0.0',
      bundles: [
        {
          id: 'default',
          version: '1.0.0',
          dependencies: {
            web: '^1.0.0',
          },
        },
        {
          id: 'web',
          version: '1.0.0',
          dependencies: {
            checkout: '^1.0.0',
            'payment-provider-stripe': '^1.0.0',
          },
        },
      ],
    });
    createExtension(
      root,
      'checkout',
      {
        id: 'checkout',
        version: '1.0.0',
      },
      ['app/pages', 'server'],
    );
    createExtension(
      root,
      'payment-provider-stripe',
      {
        id: 'payment-provider-stripe',
        version: '1.0.0',
      },
      ['app/components'],
    );

    const bootstrap = createNuxtExtensionBootstrap({ rootDir: root });

    expect(bootstrap.selectedExtensions).toEqual(['default']);
    expect(
      bootstrap.discoveredExtensions.map((extension) => extension.descriptor.id).sort(),
    ).toEqual(['bundles', 'checkout', 'default', 'payment-provider-stripe', 'web']);
    expect(bootstrap.resolvedExtensionIds).toEqual([
      'checkout',
      'default',
      'payment-provider-stripe',
      'web',
    ]);
    expect(bootstrap.activeExtensions.map((extension) => extension.descriptor.id)).toEqual([
      'checkout',
      'payment-provider-stripe',
    ]);
    expect(createNuxtExtensionLayerPaths(bootstrap)).toEqual([]);
    expect(bootstrap.resolvedExtensions.map((extension) => extension.descriptor.id)).toEqual([
      'checkout',
      'default',
      'payment-provider-stripe',
      'web',
    ]);
    expect(bootstrap.publicRuntimeConfig.public.extensionSelection).toMatchObject({
      discoveredExtensionIds: ['bundles', 'checkout', 'default', 'payment-provider-stripe', 'web'],
      resolvedExtensionIds: ['checkout', 'default', 'payment-provider-stripe', 'web'],
      selectedExtensionIds: ['default'],
    });
    expect(
      bootstrap.catalog.getTransitiveTargets({
        start: bootstrap.selectedExtensions,
        relationIds: ['dependencies'],
      }),
    ).toEqual(['checkout', 'default', 'payment-provider-stripe', 'web']);
  });

  it('keeps configured descriptor relations queryable through the bootstrap catalog', () => {
    const root = createTempRoot();

    createExtension(root, 'default', {
      id: 'default',
      version: '1.0.0',
      recommended: {
        analytics: '^1.0.0',
      },
    });
    createExtension(root, 'analytics', {
      id: 'analytics',
      version: '1.0.0',
    });

    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: root,
      options: {
        relationDescriptors: [
          {
            id: 'recommended',
            field: 'recommended',
          },
        ],
      },
    });

    expect(
      bootstrap.catalog.getTransitiveTargets({
        start: bootstrap.resolvedExtensionIds,
        relationIds: ['recommended'],
      }),
    ).toEqual(['analytics', 'default']);
  });

  it('resolves configured base extensions separately from selected extensions', () => {
    const root = createTempRoot();

    createExtension(root, 'web', {
      id: 'web',
      version: '1.0.0',
      dependencies: {
        shell: '^1.0.0',
      },
    });
    createExtension(root, 'shell', {
      id: 'shell',
      version: '1.0.0',
    });
    createExtension(root, 'demo', {
      id: 'demo',
      version: '1.0.0',
    });

    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: root,
      options: {
        baseExtensions: ['web'],
        selected: ['demo'],
      },
    });

    expect(bootstrap.selectedExtensions).toEqual(['demo']);
    expect(bootstrap.baseExtensionIds).toEqual(['web']);
    expect(bootstrap.resolvedExtensionIds).toEqual(['demo', 'shell', 'web']);
  });

  it('validates extension descriptors with the default LORION schema', () => {
    const root = createTempRoot();

    createExtension(root, 'broken', {
      name: 'broken',
      version: '1.0.0',
    });

    expect(() => createNuxtExtensionBootstrap({ rootDir: root })).toThrow(
      'Descriptor schema validation failed.',
    );
  });

  it('creates provider selection runtime config from resolved extension descriptors', () => {
    const root = createTempRoot();

    createExtension(root, 'bundles', {
      id: 'bundles',
      version: '1.0.0',
      bundles: [
        {
          id: 'default',
          version: '1.0.0',
          dependencies: {
            web: '^1.0.0',
          },
          providerPreferences: {
            payment: 'payment-provider-stripe',
          },
        },
        {
          id: 'web',
          version: '1.0.0',
          dependencies: {
            'payment-provider-invoice': '^1.0.0',
            'payment-provider-stripe': '^1.0.0',
          },
        },
      ],
    });
    createExtension(
      root,
      'payment-provider-invoice',
      {
        id: 'payment-provider-invoice',
        providesFor: 'payment',
        version: '1.0.0',
      },
      ['app/pages'],
    );
    createExtension(
      root,
      'payment-provider-stripe',
      {
        id: 'payment-provider-stripe',
        providesFor: 'payment',
        version: '1.0.0',
      },
      ['app/pages'],
    );

    const bootstrap = createNuxtExtensionBootstrap({ rootDir: root });

    expect(createNuxtProviderSelectionRuntimeConfig(bootstrap.resolvedExtensions)).toEqual({
      public: {
        providerSelection: {
          configuredProviders: {
            payment: 'payment-provider-stripe',
          },
          excludedProviderIds: ['payment-provider-invoice'],
          mismatches: [],
          selections: {
            payment: {
              capabilityId: 'payment',
              candidateProviderIds: ['payment-provider-invoice', 'payment-provider-stripe'],
              mode: 'configured',
              selectedProviderId: 'payment-provider-stripe',
            },
          },
        },
      },
    });
  });
});
