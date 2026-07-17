import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  capabilityLoader,
  createCapabilityRouteConfig,
  createReactRuntimeConfig,
  discoverCapabilities,
  discoverSelectedCapabilities,
  lorionReact,
  renderCapabilityModule,
  renderRuntimeConfigModule,
} from './vite';

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
    writeCapability(workspaceRoot, 'keycloak', '@react-workspace/keycloak', {
      defaultFor: 'auth',
      providesFor: 'auth',
    });
    writeCapability(workspaceRoot, 'admin', '@react-workspace/admin');

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['auth'],
    });

    expect(capabilities.map((capability) => capability.id)).toEqual(['auth', 'keycloak']);
  });

  it('uses explicitly selected provider capabilities before preferences and defaults', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'auth', '@react-workspace/auth');
    writeCapability(workspaceRoot, 'auth-local-jwt', '@react-workspace/auth-local-jwt', {
      providesFor: 'auth',
    });
    writeCapability(workspaceRoot, 'keycloak', '@react-workspace/keycloak', {
      defaultFor: 'auth',
      providesFor: 'auth',
    });
    writeCapability(workspaceRoot, 'feature-prefers-keycloak', '@react-workspace/feature', {
      providerPreferences: {
        auth: 'keycloak',
      },
    });

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['auth', 'auth-local-jwt', 'feature-prefers-keycloak'],
    });

    expect(capabilities.map((capability) => capability.id)).toEqual([
      'auth',
      'auth-local-jwt',
      'feature-prefers-keycloak',
    ]);
  });

  it('excludes default provider capabilities when a provider seed is selected with a host capability', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-capability-loader-'));

    writeCapability(workspaceRoot, 'web', '@react-workspace/web', {
      dependencies: { auth: '0.1.0' },
    });
    writeCapability(workspaceRoot, 'auth', '@react-workspace/auth');
    writeCapability(workspaceRoot, 'auth-local-jwt', '@react-workspace/auth-local-jwt', {
      providesFor: 'auth',
    });
    writeCapability(workspaceRoot, 'keycloak', '@react-workspace/keycloak', {
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

    writeCapability(workspaceRoot, 'keycloak', '@react-workspace/keycloak', {
      runtimeConfig: { validation: 'startup' },
    });
    writeCapability(workspaceRoot, 'data', '@react-workspace/data');
    writeRuntimeConfigSchema(workspaceRoot, 'keycloak', {
      public: ['url', 'clientId'],
      private: ['clientSecret'],
    });
    writeRuntimeConfigFile(join(workspaceRoot, '.data'), 'keycloak', {
      public: {
        url: 'https://file.example',
      },
      private: {
        clientSecret: 'file-secret',
      },
    });

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['keycloak'],
    });
    const runtimeConfig = createReactRuntimeConfig(
      capabilities,
      workspaceRoot,
      {
        env: {
          env: {
            KEYCLOAK_CLIENT_SECRET: 'env-secret',
            VITE_KEYCLOAK_CLIENT_ID: 'web',
          },
        },
      },
      { root: workspaceRoot },
    );

    expect(runtimeConfig).toEqual({
      public: {
        keycloak: {
          clientId: 'web',
          url: 'https://file.example',
        },
      },
      private: {
        keycloak: {
          clientSecret: 'env-secret',
        },
      },
    });
  });

  it('loads runtime config from a configured var dir env key', () => {
    const workspaceRoot = mkdtempSync(join(tmpdir(), 'lorion-react-runtime-config-'));
    const varDir = mkdtempSync(join(tmpdir(), 'lorion-react-var-dir-'));

    writeCapability(workspaceRoot, 'keycloak', '@react-workspace/keycloak');
    writeRuntimeConfigSchema(workspaceRoot, 'keycloak', {
      public: ['url'],
    });
    writeRuntimeConfigFile(varDir, 'keycloak', {
      public: {
        url: 'https://var-dir.example',
      },
    });

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['keycloak'],
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

    expect(runtimeConfig.public.keycloak).toEqual({
      url: 'https://var-dir.example',
    });
  });

  it('does not expose private runtime config in the public virtual module', () => {
    const source = renderRuntimeConfigModule({
      public: {
        keycloak: {
          url: 'https://example.test',
        },
      },
      private: {
        keycloak: {
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

    writeCapability(workspaceRoot, 'keycloak', '@react-workspace/keycloak', {
      runtimeConfig: { validation: 'startup' },
    });
    writeRuntimeConfigSchema(workspaceRoot, 'keycloak', {
      public: ['url'],
    });

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['keycloak'],
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

    writeCapability(workspaceRoot, 'keycloak', '@react-workspace/keycloak', {
      runtimeConfig: { validation: 'startup' },
    });
    writeFileSync(
      join(workspaceRoot, 'capabilities', 'keycloak', 'capability.schema.json'),
      '{ malformed json',
    );

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['keycloak'],
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

    writeCapability(workspaceRoot, 'keycloak', '@react-workspace/keycloak');
    writeCapability(workspaceRoot, 'data', '@react-workspace/data');
    writeRuntimeConfigSchema(workspaceRoot, 'data', {
      public: ['url'],
    });

    const capabilities = discoverSelectedCapabilities(workspaceRoot, {
      selected: ['keycloak'],
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
        providerPreferences?: Record<string, string>;
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
      'providerPreferences' in exportsOrOptions ||
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
  const providerPreferences = optionObject?.providerPreferences;
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
      ...(providerPreferences ? { providerPreferences } : {}),
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
