import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  capabilityLoader,
  createCapabilityRouteConfig,
  createReactRuntimeConfig,
  describeCapabilityComposition,
  discoverCapabilities,
  discoverSelectedCapabilities,
  lorionReact,
  type CapabilityLoaderOptions,
} from './vite';
import { renderCapabilityModule, renderRuntimeConfigModule } from './render';
import type {
  CapabilitySelectionInput,
  CapabilitySelectionSeed,
} from '@lorion-org/capability-composition';
import {
  CAPABILITY_SELECTION_OPTIONS,
  notResolved,
  resolveSelectedCapabilities,
  type CapabilitySelectionOption,
} from '@lorion-org/capability-composition';
import { conventionActivation, fileSurfaceConvention } from '@lorion-org/surface-activation';

describe('React capability Vite helpers', () => {
  it('discovers local capabilities and renders a virtual module', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'data', '@react-workspace/data');
    writeCapability(workspaceRoot, 'app-launcher', '@react-workspace/app-launcher');

    const capabilities = discoverCapabilities(workspaceRoot);

    expect(capabilities.map((capability) => capability.id)).toEqual(['app-launcher', 'data']);
    expect(renderCapabilityModule(capabilities)).toContain(
      "import { capability as appLauncherCapability } from '@react-workspace/app-launcher/capability'",
    );
    expect(renderCapabilityModule(capabilities)).toContain('export const capabilityModules = [');
  });

  it('prefers the host capability export over the package root export', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'settings', '@react-workspace/settings', {
      '.': './src/index.ts',
      './capability': './src/capability.tsx',
    });

    const [capability] = discoverCapabilities(workspaceRoot);

    expect(capability?.entryFile).toContain(`src${sep}capability.tsx`);
    expect(capability?.importSpecifier).toBe('@react-workspace/settings/capability');
  });

  it('supports a custom activation resolver targeting an existing package export', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'home', '@react-workspace/home', {
      exports: { './web': './src/web/index.ts' },
    });

    const capabilities = discoverCapabilities(workspaceRoot, {
      activation: ({ descriptor }) => ({
        exportName: `${descriptor.id}WebPlugin`,
        exportSubpath: './web',
      }),
    });
    const [home] = capabilities;

    expect(home?.importSpecifier).toBe('@react-workspace/home/web');
    expect(home?.exportName).toBe('homeWebPlugin');
    // A custom activation is host-resolved: LORION does not self-resolve the
    // specifier, so the host bundler owns resolution.
    expect(home?.entryFile).toBeUndefined();
    expect(renderCapabilityModule(capabilities)).toContain(
      "import { homeWebPlugin as homeCapability } from '@react-workspace/home/web'",
    );
  });

  it('resolves activation from a conventionActivation resolver via the surface option', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'home', '@react-workspace/home', {
      exports: { './web': './src/web/index.ts' },
    });

    const capabilities = discoverCapabilities(workspaceRoot, {
      surface: {
        name: 'web',
        resolver: conventionActivation({
          web: {
            marker: () => true,
            exportName: (id) => `${id}WebPlugin`,
            exportSubpath: './web',
          },
        }),
      },
    });
    const [home] = capabilities;

    // The conventionActivation resolver is consumed directly — no per-host adapter.
    expect(home?.importSpecifier).toBe('@react-workspace/home/web');
    expect(home?.exportName).toBe('homeWebPlugin');
  });

  it('throws when both surface and activation are passed', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'home', '@react-workspace/home', {
      exports: { './web': './src/web/index.ts' },
    });

    expect(() =>
      discoverCapabilities(workspaceRoot, {
        activation: () => ({ exportName: 'homeWebPlugin', exportSubpath: './web' }),
        surface: {
          name: 'web',
          resolver: conventionActivation({
            web: {
              marker: () => true,
              exportName: (id) => `${id}WebPlugin`,
              exportSubpath: './web',
            },
          }),
        },
      }),
    ).toThrow(/either .surface. or .activation./);
  });

  it('does not require a "./capability" export when a custom activation is used', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'home', '@react-workspace/home', {
      exports: { './web': './src/web/index.ts' },
    });

    expect(() =>
      discoverCapabilities(workspaceRoot, {
        activation: () => ({ exportName: 'homeWebPlugin', exportSubpath: './web' }),
      }),
    ).not.toThrow();
  });

  it('treats a nullish activation as graph-only: resolved but not activated', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'ui', '@react-workspace/ui', {
      exports: { '.': './src/index.ts' },
    });
    writeCapability(workspaceRoot, 'home', '@react-workspace/home', {
      dependencies: { ui: '0.0.0' },
      exports: { './web': './src/web/index.ts' },
    });

    const activation = ({ descriptor }: { descriptor: { id: string } }) =>
      descriptor.id === 'home'
        ? { exportSubpath: './web', exportName: 'homeWebPlugin' }
        : undefined;
    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['home'],
      activation,
    });

    // The graph-only capability (ui) is resolved through the dependency graph...
    expect(capabilities.map((capability) => capability.id).sort()).toEqual(['home', 'ui']);

    const rendered = renderCapabilityModule(capabilities);
    expect(rendered).toContain('resolvedCapabilityIds = ["home","ui"]');
    // ...but only the activated capability (home) is imported and registered.
    expect(rendered).toContain(
      "import { homeWebPlugin as homeCapability } from '@react-workspace/home/web'",
    );
    expect(rendered).not.toContain('@react-workspace/ui');
  });

  it('resolves through host-provided virtual descriptors without a package on disk', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));
    const writeManifest = (id: string, descriptor: Record<string, unknown> = {}): void => {
      const directory = join(workspaceRoot, 'capabilities', id);
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, 'capability.json'),
        JSON.stringify({ id, version: '1.0.0', ...descriptor }),
      );
      writeFileSync(
        join(directory, 'package.json'),
        JSON.stringify({
          name: `@react-workspace/${id}`,
          version: '1.0.0',
          private: true,
          type: 'module',
        }),
      );
    };

    // Only real features live on disk. The `suite` grouping is a virtual
    // descriptor supplied by the host, resolved through its dependencies.
    writeManifest('dashboard');
    writeManifest('reports');

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      virtualDescriptors: [
        { id: 'suite', version: '1.0.0', dependencies: { dashboard: '^1.0.0', reports: '^1.0.0' } },
      ],
      selected: ['suite'],
      activation: () => undefined,
    });

    expect(capabilities.map((capability) => capability.id).sort()).toEqual([
      'dashboard',
      'reports',
      'suite',
    ]);
    // The virtual grouping resolves but carries no package name and emits no import.
    const suite = capabilities.find((capability) => capability.id === 'suite');
    expect(suite?.packageName).toBe('');
    expect(suite?.importSpecifier).toBeUndefined();
  });

  it('expands a bundles manifest discovered from the workspace root', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));
    const writeManifest = (id: string): void => {
      const directory = join(workspaceRoot, 'capabilities', id);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, 'capability.json'), JSON.stringify({ id, version: '1.0.0' }));
      writeFileSync(
        join(directory, 'package.json'),
        JSON.stringify({
          name: `@react-workspace/${id}`,
          version: '1.0.0',
          private: true,
          type: 'module',
        }),
      );
    };
    writeManifest('dashboard');
    writeManifest('reports');
    writeFileSync(
      join(workspaceRoot, 'bundles.json'),
      JSON.stringify({
        bundles: [
          { id: 'base', version: '1.0.0', dependencies: { dashboard: '^1.0.0' } },
          { id: 'shop', version: '1.0.0', dependencies: { reports: '^1.0.0' } },
        ],
      }),
    );

    const baseBundle = 'base';
    const defaultBundle = 'shop';

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      bundles: { cwd: workspaceRoot },
      baseDescriptors: [baseBundle],
      defaultSelection: [defaultBundle],
      activation: () => undefined,
    });

    // base (always-on) + shop (default) pull dashboard + reports.
    expect(capabilities.map((capability) => capability.id).sort()).toEqual([
      'base',
      'dashboard',
      'reports',
      'shop',
    ]);
  });

  it('builds a TanStack virtual route config from enabled capability route directories', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));
    const hostRoutesDirectory = join(workspaceRoot, 'hosts', 'web', 'src', 'routes');

    mkdirSync(hostRoutesDirectory, { recursive: true });
    writeCapability(workspaceRoot, 'data', '@react-workspace/data');
    writeCapability(workspaceRoot, 'disabled', '@react-workspace/disabled', true);
    mkdirSync(join(workspaceRoot, 'capabilities', 'data', 'src', 'routes'), { recursive: true });
    mkdirSync(join(workspaceRoot, 'capabilities', 'disabled', 'src', 'routes'), {
      recursive: true,
    });

    const routeConfig = createCapabilityRouteConfig({
      workspaceRoot,
      routesDirectory: hostRoutesDirectory,
    });

    expect(routeConfig.children).toContainEqual({
      type: 'physical',
      pathPrefix: '',
      directory: '../../../../capabilities/data/src/routes',
    });
    expect(routeConfig.children).not.toContainEqual({
      type: 'physical',
      pathPrefix: '',
      directory: '../../../../capabilities/disabled/src/routes',
    });
  });

  it('resolves selected capabilities through the LORION composition graph', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'akten', '@react-workspace/akten', {
      dependencies: { settings: '0.1.0' },
    });
    writeCapability(workspaceRoot, 'settings', '@react-workspace/settings', {
      dependencies: { 'app-launcher': '0.1.0' },
    });
    writeCapability(workspaceRoot, 'app-launcher', '@react-workspace/app-launcher');
    writeCapability(workspaceRoot, 'data', '@react-workspace/data');

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['akten'],
    });

    expect(capabilities.map((capability) => capability.id)).toEqual([
      'akten',
      'app-launcher',
      'settings',
    ]);
    expect(renderCapabilityModule(capabilities)).not.toContain('@react-workspace/data/capability');
  });

  it('uses configured default selection when no explicit selection is provided', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'default', '@react-workspace/default', {
      dependencies: { web: '0.1.0' },
    });
    writeCapability(workspaceRoot, 'web', '@react-workspace/web');
    writeCapability(workspaceRoot, 'admin', '@react-workspace/admin');

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      defaultSelection: ['default'],
    });

    expect(capabilities.map((capability) => capability.id)).toEqual(['default', 'web']);
  });

  it('derives selected capabilities from default capability seed keys', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'default', '@react-workspace/default');
    writeCapability(workspaceRoot, 'settings', '@react-workspace/settings');

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      defaultSelection: ['default'],
      selectionSeed: {
        argv: ['vite', '--capabilities=settings'],
        env: {},
      },
    });

    expect(capabilities.map((capability) => capability.id)).toEqual(['settings']);
  });

  it('uses explicit selected capabilities before seed values', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'default', '@react-workspace/default');
    writeCapability(workspaceRoot, 'settings', '@react-workspace/settings');

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['default'],
      selectionSeed: {
        argv: ['vite', '--capabilities=settings'],
        env: {},
      },
    });

    expect(capabilities.map((capability) => capability.id)).toEqual(['default']);
  });

  it('can disable seed lookup and fall back to default selection', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'default', '@react-workspace/default');
    writeCapability(workspaceRoot, 'settings', '@react-workspace/settings');

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      defaultSelection: ['default'],
      selectionSeed: false,
    });

    expect(capabilities.map((capability) => capability.id)).toEqual(['default']);
  });

  it('uses provider-owned defaults as composition relations', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'auth', '@react-workspace/auth');
    writeCapability(workspaceRoot, 'auth-oidc', '@react-workspace/auth-oidc', {
      defaultFor: 'auth',
      providesFor: 'auth',
    });
    writeCapability(workspaceRoot, 'admin', '@react-workspace/admin');

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['auth'],
    });

    expect(capabilities.map((capability) => capability.id)).toEqual(['auth', 'auth-oidc']);
  });

  it('throws when two providers declare defaultFor the same capability', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'auth', '@react-workspace/auth');
    writeCapability(workspaceRoot, 'auth-oidc', '@react-workspace/auth-oidc', {
      defaultFor: 'auth',
      providesFor: 'auth',
    });
    writeCapability(workspaceRoot, 'auth-local', '@react-workspace/auth-local', {
      defaultFor: 'auth',
      providesFor: 'auth',
    });

    expect(() => discoverSelectedCapabilities(workspaceRoot, { selected: ['auth'] })).toThrow(
      /exactly one defaultFor provider per capability/,
    );
  });

  it('uses explicitly selected provider capabilities before dependencies and defaults', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'auth', '@react-workspace/auth');
    writeCapability(workspaceRoot, 'auth-local-jwt', '@react-workspace/auth-local-jwt', {
      providesFor: 'auth',
    });
    writeCapability(workspaceRoot, 'auth-oidc', '@react-workspace/auth-oidc', {
      defaultFor: 'auth',
      providesFor: 'auth',
    });
    writeCapability(workspaceRoot, 'feature-selects-oidc', '@react-workspace/feature', {
      dependencies: {
        auth: '0.1.0',
        'auth-oidc': '0.1.0',
      },
    });

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['auth', 'auth-local-jwt', 'feature-selects-oidc'],
    });

    expect(capabilities.map((capability) => capability.id)).toEqual([
      'auth',
      'auth-local-jwt',
      'feature-selects-oidc',
    ]);
  });

  it('excludes default provider capabilities when a provider is an explicit host root', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'web', '@react-workspace/web', {
      dependencies: { auth: '0.1.0' },
    });
    writeCapability(workspaceRoot, 'auth', '@react-workspace/auth');
    writeCapability(workspaceRoot, 'auth-local-jwt', '@react-workspace/auth-local-jwt', {
      providesFor: 'auth',
    });
    writeCapability(workspaceRoot, 'auth-oidc', '@react-workspace/auth-oidc', {
      defaultFor: 'auth',
      providesFor: 'auth',
    });

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['web', 'auth-local-jwt'],
    });

    expect(capabilities.map((capability) => capability.id)).toEqual([
      'auth',
      'auth-local-jwt',
      'web',
    ]);
  });

  it('builds route config from selected capabilities only', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));
    const hostRoutesDirectory = join(workspaceRoot, 'hosts', 'web', 'src', 'routes');

    mkdirSync(hostRoutesDirectory, { recursive: true });
    writeCapability(workspaceRoot, 'akten', '@react-workspace/akten', {
      dependencies: { settings: '0.1.0' },
    });
    writeCapability(workspaceRoot, 'settings', '@react-workspace/settings');
    writeCapability(workspaceRoot, 'data', '@react-workspace/data');
    mkdirSync(join(workspaceRoot, 'capabilities', 'akten', 'src', 'routes'), { recursive: true });
    mkdirSync(join(workspaceRoot, 'capabilities', 'data', 'src', 'routes'), { recursive: true });

    const routeConfig = createCapabilityRouteConfig({
      workspaceRoot,
      routesDirectory: hostRoutesDirectory,
      selected: ['akten'],
    });

    expect(routeConfig.children).toContainEqual({
      type: 'physical',
      pathPrefix: '',
      directory: '../../../../capabilities/akten/src/routes',
    });
    expect(routeConfig.children).not.toContainEqual({
      type: 'physical',
      pathPrefix: '',
      directory: '../../../../capabilities/data/src/routes',
    });
  });

  it('allows hosts to omit the default index route from virtual route config', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));
    const hostRoutesDirectory = join(workspaceRoot, 'hosts', 'web', 'src', 'routes');

    mkdirSync(hostRoutesDirectory, { recursive: true });
    writeCapability(workspaceRoot, 'shops', '@react-workspace/shops');
    mkdirSync(join(workspaceRoot, 'capabilities', 'shops', 'src', 'routes'), { recursive: true });

    const routeConfig = createCapabilityRouteConfig({
      workspaceRoot,
      routesDirectory: hostRoutesDirectory,
      indexRouteFile: false,
    });

    expect(routeConfig.children).not.toContainEqual({
      type: 'index',
      file: 'index.tsx',
    });
    expect(routeConfig.children).toContainEqual({
      type: 'physical',
      pathPrefix: '',
      directory: '../../../../capabilities/shops/src/routes',
    });
  });

  it('creates the standard React Vite capability setup', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));
    const hostRoutesDirectory = join(workspaceRoot, 'hosts', 'web', 'src', 'routes');

    mkdirSync(hostRoutesDirectory, { recursive: true });
    writeCapability(workspaceRoot, 'shops', '@react-workspace/shops');
    mkdirSync(join(workspaceRoot, 'capabilities', 'shops', 'src', 'routes'), { recursive: true });

    const setup = lorionReact({
      workspaceRoot,
      routesDirectory: hostRoutesDirectory,
      indexRouteFile: false,
    });

    expect(setup.capabilityLoader.name).toBe('lorion-react-capability-loader');
    expect(setup.routeConfig.children).toContainEqual({
      type: 'physical',
      pathPrefix: '',
      directory: '../../../../capabilities/shops/src/routes',
    });
  });

  it('loads runtime config for selected capabilities from files and env', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-runtime-config-'));

    writeCapability(workspaceRoot, 'auth-oidc', '@react-workspace/auth-oidc', {
      runtimeConfig: { validation: 'startup' },
    });
    writeCapability(workspaceRoot, 'data', '@react-workspace/data');
    writeRuntimeConfigSchema(workspaceRoot, 'auth-oidc', {
      public: ['url', 'clientId'],
      private: ['clientSecret'],
    });
    writeRuntimeConfigFile(join(workspaceRoot, '.data'), 'auth-oidc', {
      public: {
        url: 'https://file.example',
      },
      private: {
        clientSecret: 'file-secret',
      },
    });

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['auth-oidc'],
    });
    const runtimeConfig = createReactRuntimeConfig(
      capabilities,
      workspaceRoot,
      {
        env: {
          env: {
            AUTH_OIDC_CLIENT_SECRET: 'env-secret',
            VITE_AUTH_OIDC_CLIENT_ID: 'web',
          },
        },
      },
      { root: workspaceRoot },
    );

    expect(runtimeConfig).toEqual({
      public: {
        'auth-oidc': {
          clientId: 'web',
          url: 'https://file.example',
        },
      },
      private: {
        'auth-oidc': {
          clientSecret: 'env-secret',
        },
      },
    });
  });

  it('loads runtime config from a configured var dir env key', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-runtime-config-'));
    const varDir = mkdtempSync(join(tmpdir(), 'lorion-react-var-dir-'));

    writeCapability(workspaceRoot, 'auth-oidc', '@react-workspace/auth-oidc');
    writeRuntimeConfigSchema(workspaceRoot, 'auth-oidc', {
      public: ['url'],
    });
    writeRuntimeConfigFile(varDir, 'auth-oidc', {
      public: {
        url: 'https://var-dir.example',
      },
    });

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['auth-oidc'],
    });
    const runtimeConfig = createReactRuntimeConfig(
      capabilities,
      workspaceRoot,
      {
        env: {
          env: {
            REACT_VAR_DIR: varDir,
          },
        },
        varDir: {
          envKey: 'REACT_VAR_DIR',
        },
      },
      { root: workspaceRoot },
    );

    expect(runtimeConfig.public['auth-oidc']).toEqual({
      url: 'https://var-dir.example',
    });
  });

  it('does not expose private runtime config in the public virtual module', () => {
    const source = renderRuntimeConfigModule({
      public: {
        'auth-oidc': {
          url: 'https://example.test',
        },
      },
      private: {
        'auth-oidc': {
          clientSecret: 'secret',
        },
      },
    });

    expect(source).toContain('https://example.test');
    expect(source).not.toContain('secret');
    expect(source).not.toContain('private');
  });

  it('rejects the private runtime config virtual module in client builds', () => {
    const plugin = capabilityLoader();
    const resolvedId = plugin.resolveId('virtual:capability-runtime-config/server');

    expect(resolvedId).toBe('\0virtual:capability-runtime-config/server');
    expect(() => plugin.load(resolvedId!, { ssr: false })).toThrow(
      'virtual:capability-runtime-config/server may only be imported from SSR/server code.',
    );
    expect(plugin.load(resolvedId!, { ssr: true })).toContain('capabilityServerRuntimeConfig');
  });

  it('validates startup runtime config against capability schemas', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-runtime-config-'));

    writeCapability(workspaceRoot, 'auth-oidc', '@react-workspace/auth-oidc', {
      runtimeConfig: { validation: 'startup' },
    });
    writeRuntimeConfigSchema(workspaceRoot, 'auth-oidc', {
      public: ['url'],
    });

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['auth-oidc'],
    });

    expect(() =>
      createReactRuntimeConfig(
        capabilities,
        workspaceRoot,
        {
          env: { env: {} },
        },
        { root: workspaceRoot },
      ),
    ).toThrow('RuntimeConfig schema validation failed');
  });

  it('fails fast when a runtime config schema file is malformed', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-runtime-config-'));

    writeCapability(workspaceRoot, 'auth-oidc', '@react-workspace/auth-oidc', {
      runtimeConfig: { validation: 'startup' },
    });
    writeFileSync(
      join(workspaceRoot, 'capabilities', 'auth-oidc', 'capability.schema.json'),
      '{ malformed json',
    );

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['auth-oidc'],
    });

    expect(() =>
      createReactRuntimeConfig(
        capabilities,
        workspaceRoot,
        {
          env: { env: {} },
        },
        { root: workspaceRoot },
      ),
    ).toThrow(/RuntimeConfig schema JSON parse error.*capability\.schema\.json/);
  });

  it('ignores runtime config for inactive capabilities', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-runtime-config-'));

    writeCapability(workspaceRoot, 'auth-oidc', '@react-workspace/auth-oidc');
    writeCapability(workspaceRoot, 'data', '@react-workspace/data');
    writeRuntimeConfigSchema(workspaceRoot, 'data', {
      public: ['url'],
    });

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['auth-oidc'],
    });
    const runtimeConfig = createReactRuntimeConfig(
      capabilities,
      workspaceRoot,
      {
        env: {
          env: {
            VITE_DATA_URL: 'https://data.example',
          },
        },
      },
      { root: workspaceRoot },
    );

    expect(runtimeConfig.public).toEqual({});
  });

  it('fails when a capability has no package manifest', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));
    const capabilityDir = join(workspaceRoot, 'capabilities', 'broken');
    mkdirSync(capabilityDir, { recursive: true });
    writeFileSync(
      join(capabilityDir, 'capability.json'),
      JSON.stringify({ id: 'broken', version: '0.1.0' }),
    );

    expect(() => discoverCapabilities(workspaceRoot)).toThrow(
      'Capability must define both capability.json and package.json',
    );
  });

  it('fails when a capability package has no host capability export', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'broken', '@react-workspace/broken', { '.': './src/index.ts' });

    expect(() => discoverCapabilities(workspaceRoot)).toThrow(
      'Capability package is missing a "./capability" export',
    );
  });
});

function writeCapability(
  workspaceRoot: string,
  id: string,
  packageName: string,
  exportsOrOptions:
    | Record<string, string>
    | boolean
    | {
        dependencies?: Record<string, string>;
        defaultFor?: string | string[];
        disabled?: boolean;
        exports?: Record<string, string>;
        providesFor?: string | string[];
        runtimeConfig?: Record<string, unknown>;
      } = { './capability': './src/capability.ts' },
): void {
  const capabilityDir = join(workspaceRoot, 'capabilities', id);
  const optionObject =
    typeof exportsOrOptions === 'object' &&
    ('dependencies' in exportsOrOptions ||
      'defaultFor' in exportsOrOptions ||
      'disabled' in exportsOrOptions ||
      'exports' in exportsOrOptions ||
      'providesFor' in exportsOrOptions ||
      'runtimeConfig' in exportsOrOptions)
      ? exportsOrOptions
      : undefined;
  const disabled =
    typeof exportsOrOptions === 'boolean' ? exportsOrOptions : optionObject?.disabled === true;
  const exports = optionObject
    ? (optionObject.exports ?? { './capability': './src/capability.ts' })
    : typeof exportsOrOptions === 'object'
      ? exportsOrOptions
      : { './capability': './src/capability.ts' };
  const dependencies = optionObject?.dependencies;
  const defaultFor = optionObject?.defaultFor;
  const providesFor = optionObject?.providesFor;
  const runtimeConfig = optionObject?.runtimeConfig;

  mkdirSync(capabilityDir, { recursive: true });
  writeFileSync(
    join(capabilityDir, 'capability.json'),
    JSON.stringify({
      id,
      version: '0.1.0',
      disabled,
      ...(dependencies ? { dependencies } : {}),
      ...(defaultFor ? { defaultFor } : {}),
      ...(providesFor ? { providesFor } : {}),
      ...(runtimeConfig ? { runtimeConfig } : {}),
    }),
  );
  writeFileSync(
    join(capabilityDir, 'package.json'),
    JSON.stringify({ name: packageName, exports }),
  );
}

function writeRuntimeConfigSchema(
  workspaceRoot: string,
  capabilityId: string,
  sections: {
    private?: string[];
    public?: string[];
  },
): void {
  const properties = Object.fromEntries(
    (['public', 'private'] as const)
      .filter((section) => sections[section]?.length)
      .map((section) => [
        section,
        {
          type: 'object',
          properties: Object.fromEntries(
            sections[section]!.map((key) => [key, { type: 'string' }]),
          ),
          required: sections[section],
        },
      ]),
  );

  writeFileSync(
    join(workspaceRoot, 'capabilities', capabilityId, 'capability.schema.json'),
    JSON.stringify({
      type: 'object',
      properties,
      required: Object.keys(properties),
    }),
  );
}

function writeRuntimeConfigFile(
  varDir: string,
  capabilityId: string,
  config: Record<string, unknown>,
): void {
  const configDir = join(varDir, 'runtime-config', capabilityId);

  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, 'capability.runtime.json'), JSON.stringify(config));
}

// Adapter conformance: every composition option the core declares must be an
// option this adapter accepts. `CapabilityLoaderOptions` derives from the core
// contract, and this states the requirement so a future hand-written option list
// fails to compile instead of quietly dropping a feature.
type CoreOptionKey = keyof Omit<CapabilitySelectionInput, 'seed' | 'workspaceRoot'>;
type SeedOptionKey = keyof CapabilitySelectionSeed;
type MissingFromLoader = Exclude<CoreOptionKey | SeedOptionKey, keyof CapabilityLoaderOptions>;

describe('core option conformance', () => {
  it('accepts every option the core composition contract declares', () => {
    const noMissingOption: MissingFromLoader extends never ? true : false = true;
    expect(noMissingOption).toBe(true);
  });

  it('discovers through host-named descriptor paths instead of the convention dir', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-conformance-'));
    mkdirSync(join(workspaceRoot, 'features', 'reports'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'features', 'reports', 'capability.json'),
      JSON.stringify({ id: 'reports', version: '1.0.0' }),
    );
    writeFileSync(
      join(workspaceRoot, 'features', 'reports', 'package.json'),
      JSON.stringify({ name: '@react-workspace/reports', type: 'module' }),
    );

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      descriptorPaths: ['features/*/capability.json'],
      activation: () => undefined,
    });

    expect(capabilities.map((capability) => capability.id)).toEqual(['reports']);
  });

  it('validates descriptors against a host-supplied schema', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-conformance-'));
    mkdirSync(join(workspaceRoot, 'capabilities', 'reports'), { recursive: true });
    writeFileSync(
      join(workspaceRoot, 'capabilities', 'reports', 'capability.json'),
      JSON.stringify({ id: 'reports', version: '1.0.0' }),
    );
    writeFileSync(
      join(workspaceRoot, 'capabilities', 'reports', 'package.json'),
      JSON.stringify({ name: '@react-workspace/reports', type: 'module' }),
    );

    expect(() =>
      discoverSelectedCapabilities(workspaceRoot, {
        descriptorSchema: { type: 'object', required: ['owner'] },
        activation: () => undefined,
      }),
    ).toThrow(/required/);
  });
});

// A grouping declared under `nestedField` owns no directory: it shares its host's.
// The React loader and `capability-composition` must therefore resolve the same set
// from the same input, or a build composes something a report never mentions.
describe('nested grouping descriptors', () => {
  function nestedWorkspace(): string {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-nested-'));
    const write = (id: string, descriptor: Record<string, unknown>) => {
      const dir = join(workspaceRoot, 'capabilities', id);
      mkdirSync(join(dir, 'src'), { recursive: true });
      writeFileSync(join(dir, 'capability.json'), JSON.stringify(descriptor));
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({
          name: `@w/${id}`,
          type: 'module',
          exports: { './web': './src/web.ts' },
        }),
      );
      writeFileSync(join(dir, 'src', 'web.ts'), 'export const x = 1;\n');
    };

    write('shell', {
      id: 'shell',
      version: '1.0.0',
      bundles: [{ id: 'storefront', version: '0.0.0', dependencies: { catalog: '^1.0.0' } }],
    });
    write('catalog', { id: 'catalog', version: '1.0.0' });
    return workspaceRoot;
  }

  const activation = conventionActivation({
    web: fileSurfaceConvention({
      files: ['src/web.ts'],
      exportSuffix: 'WebPlugin',
      exportSubpath: './web',
      exists: existsSync,
    }),
  });

  it('gives a nested grouping no package and no activation of its host', () => {
    const workspaceRoot = nestedWorkspace();

    const capabilities = discoverCapabilities(workspaceRoot, {
      nestedField: 'bundles',
      surface: { name: 'web', resolver: activation },
    });
    const storefront = capabilities.find((capability) => capability.id === 'storefront');

    expect(storefront).toBeDefined();
    // Reading the host's package or surface here is what produced an import of a
    // non-existent export, and a second copy of the host's route directory.
    expect(storefront?.packageName).toBe('');
    expect(storefront?.importSpecifier).toBeUndefined();
    expect(storefront?.exportName).toBeUndefined();
    expect(storefront?.routesDirectory).toBeUndefined();
  });

  it('resolves the same capability set as capability-composition', () => {
    const workspaceRoot = nestedWorkspace();
    const seed = { baseDescriptors: ['shell'], selected: ['storefront'] };

    // Compared by id AND package name: a host that reports only package-backed
    // capabilities counts a grouping as a package the moment it inherits one, which
    // is how a build and a report on it came to disagree.
    const loaderIds = discoverSelectedCapabilities(workspaceRoot, {
      ...seed,
      nestedField: 'bundles',
      surface: { name: 'web', resolver: activation },
    })
      .map((capability) => `${capability.id}:${capability.packageName}`)
      .sort();

    const coreIds = resolveSelectedCapabilities({
      workspaceRoot,
      nestedField: 'bundles',
      seed,
    })
      .map((capability) => `${capability.id}:${capability.packageName}`)
      .sort();

    expect(loaderIds).toEqual(coreIds);
  });
});

// Adapter conformance, behavioural. A type-level check cannot see whether an option
// is forwarded, only whether it is accepted, so every core option gets a case that
// changes the resolved set and asserts the change. `CAPABILITY_SELECTION_OPTIONS` is
// the core's own list, so an option added there without a case here fails to compile.
describe('core option forwarding', () => {
  function workspace(): string {
    const root = mkdtempSync(join(tmpdir(), 'lorion-react-forward-'));
    const write = (dir: string, id: string, descriptor: Record<string, unknown>) => {
      const target = join(root, dir, id);
      mkdirSync(target, { recursive: true });
      writeFileSync(
        join(target, 'capability.json'),
        JSON.stringify({ version: '1.0.0', ...descriptor, id }),
      );
      writeFileSync(
        join(target, 'package.json'),
        JSON.stringify({ name: `@w/${id}`, type: 'module' }),
      );
    };
    write('capabilities', 'alpha', { dependencies: { beta: '^1.0.0' } });
    write('capabilities', 'beta', {});
    write('capabilities', 'gamma', { linked: 'beta' });
    write('capabilities', 'grouped', {
      groups: [{ id: 'grouped-under-groups', version: '0.0.0', dependencies: { beta: '^1.0.0' } }],
    });
    write('features', 'delta', {});
    return root;
  }

  const ids = (root: string, options: CapabilityLoaderOptions): string[] =>
    discoverSelectedCapabilities(root, { activation: () => undefined, ...options })
      .map((capability) => capability.id)
      .sort();

  // One case per core option. A missing key is a compile error, which is what makes
  // this a guard rather than a list of tests someone remembered to write.
  const cases: Record<CapabilitySelectionOption, (root: string) => void> = {
    capabilitiesDir: (root) => {
      expect(ids(root, { capabilitiesDir: 'features', selected: ['delta'] })).toEqual(['delta']);
    },
    descriptorPaths: (root) => {
      expect(
        ids(root, { descriptorPaths: ['features/*/capability.json'], selected: ['delta'] }),
      ).toEqual(['delta']);
    },
    descriptorSchema: (root) => {
      expect(() =>
        ids(root, {
          descriptorSchema: { type: 'object', required: ['owner'] },
          selected: ['beta'],
        }),
      ).toThrow(/required/);
    },
    virtualDescriptors: (root) => {
      expect(
        ids(root, {
          virtualDescriptors: [
            { id: 'virtual-group', version: '0.0.0', dependencies: { beta: '^1.0.0' } },
          ],
          selected: ['virtual-group'],
        }),
      ).toEqual(['beta', 'virtual-group']);
    },
    bundles: (root) => {
      writeFileSync(
        join(root, 'bundles.json'),
        JSON.stringify({
          bundles: [{ id: 'manifest-group', version: '0.0.0', dependencies: { beta: '^1.0.0' } }],
        }),
      );
      expect(ids(root, { bundles: { cwd: root }, selected: ['manifest-group'] })).toEqual([
        'beta',
        'manifest-group',
      ]);
    },
    nestedField: (root) => {
      // A non-default field name: `bundles` is the contract's default, so passing it
      // would prove nothing about forwarding.
      expect(ids(root, { nestedField: 'groups', selected: ['grouped-under-groups'] })).toEqual([
        'beta',
        'grouped-under-groups',
      ]);
      expect(() => ids(root, { selected: ['grouped-under-groups'] })).toThrow(/Unknown selected/);
    },
    relationDescriptors: (root) => {
      // Walking the relation is the policy's job, so both are set; dropping only the
      // relation descriptor must stop `gamma` from reaching `beta`.
      const policy = { resolutionRelationIds: ['dependencies', 'linked'] };
      expect(
        ids(root, {
          relationDescriptors: [{ id: 'linked', field: 'linked' }],
          policy,
          selected: ['gamma'],
        }),
      ).toEqual(['beta', 'gamma']);
      expect(ids(root, { policy, selected: ['gamma'] })).toEqual(['gamma']);
    },
    policy: (root) => {
      // Resolving no relations means a selected capability pulls nothing.
      expect(ids(root, { policy: { resolutionRelationIds: [] }, selected: ['alpha'] })).toEqual([
        'alpha',
      ]);
    },
    baseDescriptors: (root) => {
      expect(ids(root, { baseDescriptors: ['beta'], selected: ['gamma'] })).toEqual([
        'beta',
        'gamma',
      ]);
    },
    defaultSelection: (root) => {
      expect(ids(root, { defaultSelection: ['beta'], selectionSeed: false })).toEqual(['beta']);
    },
    selected: (root) => {
      expect(ids(root, { selected: ['beta'] })).toEqual(['beta']);
    },
    selectionSeed: (root) => {
      expect(
        ids(root, { selectionSeed: { argv: [], env: { PICK: 'beta' }, envKeys: ['PICK'] } }),
      ).toEqual(['beta']);
      // The seed is one entry in the option list but several knobs; a host that
      // forwards only part of it forwards none of it in practice.
      expect(
        ids(root, { selectionSeed: { argv: ['--pick=beta'], env: {}, cliKeys: ['pick'] } }),
      ).toEqual(['beta']);
      // A logical `key` derives its env name; only an explicit `envKeys` is literal.
      expect(
        ids(root, { selectionSeed: { argv: [], env: { LORION_PICKS: 'beta' }, key: 'pick' } }),
      ).toEqual(['beta']);
    },
  };

  it.each([...CAPABILITY_SELECTION_OPTIONS])('forwards %s', (option) => {
    cases[option](workspace());
  });
});

describe('describeCapabilityComposition', () => {
  it('reports the same composition the loader builds, groupings included', () => {
    const root = mkdtempSync(join(tmpdir(), 'lorion-react-report-'));
    const write = (id: string, descriptor: Record<string, unknown>) => {
      const dir = join(root, 'capabilities', id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, 'capability.json'),
        JSON.stringify({ version: '1.0.0', ...descriptor, id }),
      );
      writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: `@x/${id}`, exports: { './capability': './index.js' } }),
      );
    };
    write('platform', {});
    write('shop', { dependencies: { platform: '^1.0.0' } });
    write('admin', {});
    write('auth-oidc', { providesFor: 'auth', defaultFor: 'auth' });
    write('auth', {});
    writeFileSync(
      join(root, 'bundles.json'),
      JSON.stringify({
        bundles: [{ id: 'storefront', version: '1.0.0', dependencies: { shop: '^1.0.0' } }],
      }),
    );

    const options = {
      bundles: { cwd: root },
      baseDescriptors: ['auth'],
      selected: ['storefront'],
      selectionSeed: false as const,
    };
    const report = describeCapabilityComposition(root, options);

    // The grouping resolves and is counted, and so is the provider the graph chose
    // without anyone naming it.
    expect(report.requested).toEqual(['storefront']);
    expect(report.selected).toEqual(['storefront']);
    expect(report.base).toEqual(['auth']);
    expect(report.resolved).toEqual(['auth', 'auth-oidc', 'platform', 'shop', 'storefront']);
    expect(report.discovered).toContain('storefront');
    expect(report.providers).toEqual([
      {
        capability: 'auth',
        mode: 'default',
        overridden: [],
        provider: 'auth-oidc',
        resolved: true,
      },
    ]);
    expect(notResolved(report)).toEqual(['admin']);

    // The report describes what the loader emits: same ids, minus the groupings,
    // which carry no module.
    const emitted = discoverSelectedCapabilities(root, options)
      .filter((capability) => capability.packageName !== '')
      .map((capability) => capability.id);
    expect(report.resolved.filter((id) => id !== 'storefront')).toEqual(emitted);
  });
});
