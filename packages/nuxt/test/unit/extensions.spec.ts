import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createNuxtProviderSelectionRuntimeConfig,
  createNuxtExtensionBootstrap,
  createNuxtExtensionCatalog,
  createNuxtExtensionEntryMap,
  createNuxtExtensionLayerPaths,
  discoverNuxtExtensionEntries,
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
        selected: ['settings'],
        defaultSelection: ['default'],
      }),
    ).toEqual(['settings']);
  });

  it('derives selected extensions from the shared capability seed keys', () => {
    const root = createTempRoot();

    createExtension(root, 'default', {
      id: 'default',
      version: '1.0.0',
    });
    createExtension(root, 'settings', {
      id: 'settings',
      version: '1.0.0',
    });

    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: root,
      options: {
        selectionSeed: {
          argv: ['nuxt', '--capabilities=settings'],
          env: {},
        },
      },
    });

    expect(bootstrap.selectedExtensions).toEqual(['settings']);
  });

  it('derives selected extensions from an overridden singular seed key', () => {
    const root = createTempRoot();

    createExtension(root, 'default', {
      id: 'default',
      version: '1.0.0',
    });
    createExtension(root, 'shop', {
      id: 'shop',
      version: '1.0.0',
    });

    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: root,
      options: {
        selectionSeed: {
          argv: [],
          env: {
            LORION_PROFILES: 'shop',
          },
          key: 'profile',
        },
      },
    });

    expect(bootstrap.selectedExtensions).toEqual(['shop']);
  });

  it('uses explicit selected extensions before seed values', () => {
    const root = createTempRoot();

    createExtension(root, 'default', {
      id: 'default',
      version: '1.0.0',
    });
    createExtension(root, 'settings', {
      id: 'settings',
      version: '1.0.0',
    });

    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: root,
      options: {
        selected: ['default'],
        selectionSeed: {
          argv: ['nuxt', '--capabilities=settings'],
          env: {},
        },
      },
    });

    expect(bootstrap.selectedExtensions).toEqual(['default']);
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
        baseDescriptors: ['web'],
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

  it('discovers reusable extension entries with descriptor locations and catalog helpers', () => {
    const root = createTempRoot();

    createExtension(root, 'web', {
      id: 'web',
      version: '1.0.0',
      recommended: {
        analytics: '^1.0.0',
      },
    });
    createExtension(root, 'analytics', {
      id: 'analytics',
      version: '1.0.0',
    });

    const entries = discoverNuxtExtensionEntries({
      projectRootDir: root,
      options: {
        relationDescriptors: [
          {
            id: 'recommended',
          },
        ],
      },
    });
    const entryMap = createNuxtExtensionEntryMap(entries);
    const catalog = createNuxtExtensionCatalog({
      entries,
      relationDescriptors: [
        {
          id: 'recommended',
        },
      ],
    });

    expect(entryMap.get('web')?.descriptor.location).toBe(join(root, 'extensions', 'web'));
    expect(
      catalog.getTransitiveTargets({
        start: ['web'],
        relationIds: ['recommended'],
      }),
    ).toEqual(['analytics', 'web']);
  });

  it('accepts runtime config validation policy metadata', () => {
    const root = createTempRoot();

    createExtension(root, 'auth-oidc', {
      id: 'auth-oidc',
      runtimeConfig: {
        validation: 'onUse',
      },
      version: '1.0.0',
    });

    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: root,
      options: {
        selected: ['auth-oidc'],
      },
    });

    expect(bootstrap.resolvedExtensions[0]?.descriptor.runtimeConfig).toEqual({
      validation: 'onUse',
    });
  });

  it('rejects unknown runtime config validation policy metadata', () => {
    const root = createTempRoot();

    createExtension(root, 'auth-oidc', {
      id: 'auth-oidc',
      runtimeConfig: {
        validation: 'sometimes',
      },
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
        },
        {
          id: 'web',
          version: '1.0.0',
          dependencies: {
            payment: '^1.0.0',
            'payment-provider-stripe': '^1.0.0',
          },
        },
        // The capability the two providers fill. Declaring it is what lets a
        // mistyped `providesFor` be reported instead of opening a second one.
        {
          id: 'payment',
          version: '1.0.0',
          description: 'Capability filled by a payment provider.',
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

    expect(createNuxtProviderSelectionRuntimeConfig(bootstrap.providerSelection)).toEqual({
      public: {
        providerSelection: {
          excludedProviderIds: ['payment-provider-invoice'],
          selections: {
            payment: {
              capabilityId: 'payment',
              candidateProviderIds: ['payment-provider-invoice', 'payment-provider-stripe'],
              mode: 'dependency',
              overriddenProviderIds: [],
              selectedProviderId: 'payment-provider-stripe',
            },
          },
        },
      },
    });
  });

  it('uses provider-owned defaults as composition relations', () => {
    const root = createTempRoot();

    createExtension(root, 'default', {
      id: 'default',
      version: '1.0.0',
      dependencies: {
        auth: '^1.0.0',
      },
    });
    createExtension(root, 'auth', {
      id: 'auth',
      version: '1.0.0',
    });
    createExtension(root, 'auth-local-jwt', {
      id: 'auth-local-jwt',
      providesFor: 'auth',
      version: '1.0.0',
    });
    createExtension(root, 'auth-oidc', {
      id: 'auth-oidc',
      defaultFor: 'auth',
      providesFor: 'auth',
      version: '1.0.0',
    });

    const bootstrap = createNuxtExtensionBootstrap({ rootDir: root });

    expect(bootstrap.resolvedExtensionIds).toContain('auth-oidc');
    expect(createNuxtProviderSelectionRuntimeConfig(bootstrap.providerSelection)).toEqual({
      public: {
        providerSelection: {
          excludedProviderIds: ['auth-local-jwt'],
          selections: {
            auth: {
              capabilityId: 'auth',
              candidateProviderIds: ['auth-local-jwt', 'auth-oidc'],
              mode: 'default',
              overriddenProviderIds: [],
              selectedProviderId: 'auth-oidc',
            },
          },
        },
      },
    });
  });

  it('uses explicit provider roots before descriptor dependencies and defaults', () => {
    const root = createTempRoot();

    createExtension(root, 'default', {
      id: 'default',
      version: '1.0.0',
      dependencies: {
        auth: '^1.0.0',
      },
    });
    createExtension(root, 'auth', {
      id: 'auth',
      version: '1.0.0',
    });
    createExtension(
      root,
      'auth-local-jwt',
      {
        id: 'auth-local-jwt',
        providesFor: 'auth',
        version: '1.0.0',
      },
      ['app'],
    );
    createExtension(
      root,
      'auth-oidc',
      {
        id: 'auth-oidc',
        defaultFor: 'auth',
        providesFor: 'auth',
        version: '1.0.0',
      },
      ['app'],
    );
    createExtension(root, 'feature-selects-oidc', {
      id: 'feature-selects-oidc',
      dependencies: {
        auth: '^1.0.0',
        'auth-oidc': '^1.0.0',
      },
      version: '1.0.0',
    });

    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: root,
      options: {
        baseDescriptors: ['default'],
        selected: ['auth-local-jwt', 'feature-selects-oidc'],
      },
    });

    expect(bootstrap.resolvedExtensionIds).toContain('auth-local-jwt');
    expect(bootstrap.resolvedExtensionIds).toContain('feature-selects-oidc');
    expect(bootstrap.resolvedExtensionIds).not.toContain('auth-oidc');
    expect(createNuxtProviderSelectionRuntimeConfig(bootstrap.providerSelection)).toMatchObject({
      public: {
        providerSelection: {
          excludedProviderIds: ['auth-oidc'],
          selections: {
            auth: {
              mode: 'explicit',
              overriddenProviderIds: ['auth-oidc'],
              selectedProviderId: 'auth-local-jwt',
            },
          },
        },
      },
    });
  });

  it('excludes default providers when a provider is selected explicitly with a host extension', () => {
    const root = createTempRoot();

    createExtension(root, 'web', {
      id: 'web',
      version: '1.0.0',
      dependencies: {
        auth: '^1.0.0',
      },
    });
    createExtension(root, 'auth', {
      id: 'auth',
      version: '1.0.0',
    });
    createExtension(
      root,
      'auth-local-jwt',
      {
        id: 'auth-local-jwt',
        providesFor: 'auth',
        version: '1.0.0',
      },
      ['app'],
    );
    createExtension(
      root,
      'auth-oidc',
      {
        id: 'auth-oidc',
        defaultFor: 'auth',
        providesFor: 'auth',
        version: '1.0.0',
      },
      ['app'],
    );

    const bootstrap = createNuxtExtensionBootstrap({
      rootDir: root,
      options: {
        selected: ['web', 'auth-local-jwt'],
      },
    });
    expect(bootstrap.resolvedExtensionIds).toEqual(['auth', 'auth-local-jwt', 'web']);
    expect(createNuxtProviderSelectionRuntimeConfig(bootstrap.providerSelection)).toMatchObject({
      public: {
        providerSelection: {
          excludedProviderIds: ['auth-oidc'],
          selections: {
            auth: {
              candidateProviderIds: ['auth-local-jwt', 'auth-oidc'],
              mode: 'explicit',
              overriddenProviderIds: ['auth-oidc'],
              selectedProviderId: 'auth-local-jwt',
            },
          },
        },
      },
    });
  });
});
