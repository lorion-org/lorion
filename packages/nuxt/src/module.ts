import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  addImports,
  addServerImports,
  addServerTemplate,
  addTemplate,
  createResolver,
  defineNuxtModule,
  useLogger,
} from '@nuxt/kit';
import type { Nuxt, NuxtConfigLayer, NuxtModule, NuxtOptions } from '@nuxt/schema';
import {
  createNuxtExtensionBootstrap,
  createNuxtProviderSelectionRuntimeConfig,
  type NuxtExtensionBootstrap,
  type NuxtExtensionEntry,
} from './extensions';
import {
  createNuxtRuntimeConfig,
  getNuxtExtensionSelection,
  getNuxtProviderSelection,
  mergeNuxtRuntimeConfig,
} from './runtime-config';
import {
  createNuxtRuntimeConfigFromSource,
  resolveNuxtRuntimeConfigPublicRootPath,
  validateNuxtRuntimeConfigSourceScopes,
} from './runtime-config-node';
import type {
  NuxtExtensionBootstrapLogEvent,
  LorionNuxtModuleOptions,
  NuxtPrivateRuntimeConfigMode,
  NuxtProviderSelectionModuleOptions,
  NuxtRuntimeConfig,
  RuntimeConfigNuxtModuleOptions,
} from './types';
import type { RuntimeConfigSchemaTargetInput } from '@lorion-org/runtime-config-node';

type RuntimeConfigComposableDefaults = {
  contextOutputKey?: string;
  privateInput?: NuxtPrivateRuntimeConfigMode;
};

type RuntimeConfigProjectionOptions = Omit<
  RuntimeConfigNuxtModuleOptions,
  'enabled' | 'imports' | 'publicAssets' | 'source' | 'validation'
> & {
  scopeIds?: string[];
};

type MutableNuxtOptions = NuxtOptions & {
  _layers: NuxtConfigLayer[];
};

type RuntimeConfigPublicAssetsNitroConfig = {
  publicAssets?: Array<{
    dir: string;
    maxAge?: number;
  }>;
};

type RuntimeConfigPublicAssetsHook = (
  name: 'nitro:config',
  handler: (nitroConfig: RuntimeConfigPublicAssetsNitroConfig) => void,
) => void;

const runtimeConfigImportNames = [
  'useRuntimeConfigFragment',
  'useRuntimeConfigScope',
  'usePublicRuntimeConfigScope',
  'usePrivateRuntimeConfigScope',
  'useRuntimeConfigValue',
] as const;

const runtimeConfigComposablesTemplate = 'lorion/runtime-config-composables.ts';
const serverRuntimeConfigComposablesTemplate = '#internal/lorion-runtime-config-composables.mjs';

const defaultRuntimeConfigSource = {
  contextInputKey: 'contexts',
  contextOutputKey: '__contexts',
  paths: ['.runtimeconfig/runtime-config/*/runtime.config.json'],
} as const;

const joinLogIds = (ids: string[]): string => ids.join(', ');

const hasLogIds = (ids: string[]): boolean => ids.length > 0;

function pickRuntimeConfigOptions(
  options: RuntimeConfigNuxtModuleOptions,
  bootstrap?: NuxtExtensionBootstrap,
): RuntimeConfigProjectionOptions {
  const runtimeConfigOptions: RuntimeConfigProjectionOptions = {};

  if (options.contextInputKey !== undefined)
    runtimeConfigOptions.contextInputKey = options.contextInputKey;
  if (options.contextOutputKey !== undefined)
    runtimeConfigOptions.contextOutputKey = options.contextOutputKey;
  if (options.fragments !== undefined) runtimeConfigOptions.fragments = options.fragments;
  if (options.includeContexts !== undefined)
    runtimeConfigOptions.includeContexts = options.includeContexts;
  if (options.keyStrategy !== undefined) runtimeConfigOptions.keyStrategy = options.keyStrategy;
  if (options.privateOutput !== undefined)
    runtimeConfigOptions.privateOutput = options.privateOutput;
  if (options.runtimeConfig !== undefined)
    runtimeConfigOptions.runtimeConfig = options.runtimeConfig;
  if (bootstrap?.resolvedExtensionIds.length) {
    runtimeConfigOptions.scopeIds = bootstrap.resolvedExtensionIds;
  }

  return runtimeConfigOptions;
}

function createRuntimeConfigComposableDefaults(
  options: RuntimeConfigNuxtModuleOptions,
): RuntimeConfigComposableDefaults {
  return {
    ...(options.contextOutputKey ? { contextOutputKey: options.contextOutputKey } : {}),
    privateInput: options.privateOutput === 'section' ? 'section' : 'root',
  };
}

function normalizeImportPath(path: string): string {
  return path.replace(/\\/g, '/');
}

function createRuntimeConfigComposablesSource(input: {
  runtimeConfigFrom: string;
  typed: boolean;
  useRuntimeConfigFrom: string;
}): string {
  const typeImports = input.typed
    ? `
import type {
  GetRuntimeConfigFragmentOptions,
  GetRuntimeConfigScopeOptions,
  ResolveRuntimeConfigValueFromRuntimeConfigOptions,
  RuntimeConfigContext,
  RuntimeConfigSection,
} from '@lorion-org/runtime-config'
import type {
  NuxtPrivateRuntimeConfigMode,
  NuxtRuntimeConfigInput,
  ReadNuxtRuntimeConfigOptions,
} from '${input.runtimeConfigFrom}'

export type RuntimeConfigComposableDefaults = {
  contextOutputKey?: string
  privateInput?: NuxtPrivateRuntimeConfigMode
}

export type UseRuntimeConfigScopeOptions = GetRuntimeConfigScopeOptions & ReadNuxtRuntimeConfigOptions
export type UsePublicRuntimeConfigScopeOptions =
  Omit<GetRuntimeConfigScopeOptions, 'visibility'> &
  ReadNuxtRuntimeConfigOptions
export type UseRuntimeConfigValueOptions<T = unknown> =
  ResolveRuntimeConfigValueFromRuntimeConfigOptions<T> &
  ReadNuxtRuntimeConfigOptions
export type UseRuntimeConfigFragmentOptions =
  GetRuntimeConfigFragmentOptions &
  ReadNuxtRuntimeConfigOptions
`
    : '';
  const typeAnnotations = input.typed
    ? {
        defaults: ': RuntimeConfigComposableDefaults',
        fragmentReturn: ': RuntimeConfigContext',
        fragmentOptions: ': UseRuntimeConfigFragmentOptions',
        privateOptions: ': UsePublicRuntimeConfigScopeOptions',
        publicOptions: ': UsePublicRuntimeConfigScopeOptions',
        runtimeConfig: ': NuxtRuntimeConfigInput',
        scopeOptions: ': UseRuntimeConfigScopeOptions',
        scopeReturn: '<T extends RuntimeConfigSection = RuntimeConfigSection>',
        valueOptions: '<T = unknown>',
        valueOptionsType: ': UseRuntimeConfigValueOptions<T>',
        valueReturn: ': T | undefined',
      }
    : {
        defaults: '',
        fragmentReturn: '',
        fragmentOptions: '',
        privateOptions: '',
        publicOptions: '',
        runtimeConfig: '',
        scopeOptions: '',
        scopeReturn: '',
        valueOptions: '',
        valueOptionsType: '',
        valueReturn: '',
      };

  return `import { useRuntimeConfig } from '${input.useRuntimeConfigFrom}'
import {
  getNuxtRuntimeConfigFragment,
  getNuxtRuntimeConfigScope,
  getPrivateNuxtRuntimeConfigScope,
  getPublicNuxtRuntimeConfigScope,
  resolveNuxtRuntimeConfigValue,
} from '${input.runtimeConfigFrom}'
${typeImports}
const runtimeConfigDefaultsKey = '__lorionNuxt'

function getComposableDefaults(runtimeConfig${typeAnnotations.runtimeConfig})${typeAnnotations.defaults} {
  const container = runtimeConfig.public?.[runtimeConfigDefaultsKey]

  if (typeof container !== 'object' || container === null || Array.isArray(container)) {
    return {}
  }

  const defaults = container.runtimeConfig

  return typeof defaults === 'object' && defaults !== null && !Array.isArray(defaults)
    ? defaults
    : {}
}

function withComposableDefaults(runtimeConfig${typeAnnotations.runtimeConfig}, options = {}) {
  return {
    ...getComposableDefaults(runtimeConfig),
    ...options,
  }
}

export function useRuntimeConfigFragment(scopeId, options${typeAnnotations.fragmentOptions} = {})${typeAnnotations.fragmentReturn} {
  const runtimeConfig = useRuntimeConfig()

  return getNuxtRuntimeConfigFragment(runtimeConfig, scopeId, withComposableDefaults(runtimeConfig, options))
}

export function useRuntimeConfigScope${typeAnnotations.scopeReturn}(scopeId, options${typeAnnotations.scopeOptions} = {}) {
  const runtimeConfig = useRuntimeConfig()

  return getNuxtRuntimeConfigScope(runtimeConfig, scopeId, withComposableDefaults(runtimeConfig, options))
}

export function usePublicRuntimeConfigScope${typeAnnotations.scopeReturn}(scopeId, options${typeAnnotations.publicOptions} = {}) {
  const runtimeConfig = useRuntimeConfig()

  return getPublicNuxtRuntimeConfigScope(runtimeConfig, scopeId, withComposableDefaults(runtimeConfig, options))
}

export function usePrivateRuntimeConfigScope${typeAnnotations.scopeReturn}(scopeId, options${typeAnnotations.privateOptions} = {}) {
  const runtimeConfig = useRuntimeConfig()

  return getPrivateNuxtRuntimeConfigScope(runtimeConfig, scopeId, withComposableDefaults(runtimeConfig, options))
}

export function useRuntimeConfigValue${typeAnnotations.valueOptions}(scopeId, key, options${typeAnnotations.valueOptionsType} = {})${typeAnnotations.valueReturn} {
  const runtimeConfig = useRuntimeConfig()

  return resolveNuxtRuntimeConfigValue(runtimeConfig, scopeId, key, withComposableDefaults(runtimeConfig, options))
}
`;
}

function createDefaultRuntimeConfigOptions(
  rootDir: string,
): RuntimeConfigNuxtModuleOptions | undefined {
  const paths = defaultRuntimeConfigSource.paths.map((pattern) => join(rootDir, pattern));
  const runtimeConfigDir = join(rootDir, '.runtimeconfig', 'runtime-config');

  if (!existsSync(runtimeConfigDir)) return undefined;

  return {
    contextInputKey: defaultRuntimeConfigSource.contextInputKey,
    contextOutputKey: defaultRuntimeConfigSource.contextOutputKey,
    source: { paths },
  };
}

function resolveRuntimeConfigModuleOptions(
  options: RuntimeConfigNuxtModuleOptions | undefined,
  rootDir: string,
): RuntimeConfigNuxtModuleOptions | undefined {
  if (options?.enabled === false) return undefined;

  return options ?? createDefaultRuntimeConfigOptions(rootDir);
}

function registerRuntimeConfigPublicAssets(
  options: RuntimeConfigNuxtModuleOptions,
  nuxt: Nuxt,
): void {
  if (options.publicAssets === false || !options.source) return;

  const publicRoot = resolveNuxtRuntimeConfigPublicRootPath(options.source);
  if (!publicRoot || !existsSync(publicRoot)) return;

  const maxAge = typeof options.publicAssets === 'object' ? options.publicAssets.maxAge : undefined;
  const hook = nuxt.hook as unknown as RuntimeConfigPublicAssetsHook;

  hook('nitro:config', (nitroConfig) => {
    nitroConfig.publicAssets = nitroConfig.publicAssets ?? [];
    nitroConfig.publicAssets.push({
      dir: publicRoot,
      ...(maxAge === undefined ? {} : { maxAge }),
    });
  });
}

function resolveRuntimeConfigValidationTargets(
  bootstrap?: NuxtExtensionBootstrap,
): RuntimeConfigSchemaTargetInput[] {
  return (
    bootstrap?.resolvedExtensions.map((extension) => ({
      scopeId: extension.descriptor.id,
      cwd: extension.cwd,
    })) ?? []
  );
}

function validateRuntimeConfigSource(
  options: RuntimeConfigNuxtModuleOptions,
  bootstrap?: NuxtExtensionBootstrap,
): void {
  if (!options.source || options.validation === false || !options.validation) return;
  const targets = resolveRuntimeConfigValidationTargets(bootstrap);

  if (!targets.length) return;

  validateNuxtRuntimeConfigSourceScopes(options.source, targets, {
    ...(options.validation.formatError ? { formatError: options.validation.formatError } : {}),
    ...(options.validation.schemaFileName
      ? { schemaFileName: options.validation.schemaFileName }
      : {}),
  });
}

function addRuntimeConfigImports(options: RuntimeConfigNuxtModuleOptions): void {
  if (options.imports === false) return;

  const resolver = createResolver(import.meta.url);
  const runtimeConfigFrom = normalizeImportPath(resolver.resolve('./runtime-config'));
  const template = addTemplate({
    filename: runtimeConfigComposablesTemplate,
    getContents: () =>
      createRuntimeConfigComposablesSource({
        runtimeConfigFrom,
        typed: true,
        useRuntimeConfigFrom: 'nuxt/app',
      }),
  });

  addServerTemplate({
    filename: serverRuntimeConfigComposablesTemplate,
    getContents: () =>
      createRuntimeConfigComposablesSource({
        runtimeConfigFrom,
        typed: false,
        useRuntimeConfigFrom: 'nitropack/runtime',
      }),
  });

  const imports = runtimeConfigImportNames.map((name) => ({
    as: name,
    from: `#build/${template.filename}`,
    name,
  }));
  const serverImports = runtimeConfigImportNames.map((name) => ({
    as: name,
    from: serverRuntimeConfigComposablesTemplate,
    name,
  }));

  addImports(imports);
  addServerImports(serverImports);
}

function createRuntimeConfigDefaultsConfig(
  options: RuntimeConfigNuxtModuleOptions,
): NuxtRuntimeConfig {
  return {
    public: {
      __lorionNuxt: {
        runtimeConfig: createRuntimeConfigComposableDefaults(options),
      },
    },
  };
}

export function createConfiguredNuxtRuntimeConfig(
  options: LorionNuxtModuleOptions,
  bootstrap?: NuxtExtensionBootstrap,
): NuxtRuntimeConfig | undefined {
  if (!options.runtimeConfig || options.runtimeConfig.enabled === false) return undefined;

  const runtimeConfigOptions = pickRuntimeConfigOptions(options.runtimeConfig, bootstrap);

  return options.runtimeConfig.source
    ? createNuxtRuntimeConfigFromSource(options.runtimeConfig.source, runtimeConfigOptions)
    : createNuxtRuntimeConfig(runtimeConfigOptions);
}

export function createNuxtRuntimeConfigExtension(
  options: RuntimeConfigNuxtModuleOptions,
): NuxtRuntimeConfig | undefined {
  return createConfiguredNuxtRuntimeConfig({
    runtimeConfig: options,
  });
}

function applyRuntimeConfigModule(input: {
  bootstrap?: NuxtExtensionBootstrap;
  currentRuntimeConfig: NuxtRuntimeConfig;
  moduleOptions?: RuntimeConfigNuxtModuleOptions;
  nuxt: Nuxt;
  rootDir: string;
}): NuxtRuntimeConfig {
  const runtimeConfigOptions = resolveRuntimeConfigModuleOptions(
    input.moduleOptions,
    input.rootDir,
  );
  const runtimeConfig = runtimeConfigOptions
    ? createConfiguredNuxtRuntimeConfig({ runtimeConfig: runtimeConfigOptions }, input.bootstrap)
    : undefined;

  if (!runtimeConfigOptions) return input.currentRuntimeConfig;

  addRuntimeConfigImports(runtimeConfigOptions);
  registerRuntimeConfigPublicAssets(runtimeConfigOptions, input.nuxt);
  validateRuntimeConfigSource(runtimeConfigOptions, input.bootstrap);

  return mergeNuxtRuntimeConfig(
    input.currentRuntimeConfig,
    mergeNuxtRuntimeConfig(createRuntimeConfigDefaultsConfig(runtimeConfigOptions), runtimeConfig),
  );
}

function createProviderSelectionRuntimeConfig(
  bootstrap: NuxtExtensionBootstrap,
  options: NuxtProviderSelectionModuleOptions | undefined,
): NuxtRuntimeConfig | undefined {
  if (options?.enabled === false) return undefined;

  return createNuxtProviderSelectionRuntimeConfig(bootstrap.resolvedExtensions, options);
}

export function createNuxtExtensionBootstrapLogEvent(input: {
  bootstrap: NuxtExtensionBootstrap;
  providerSelectionRuntimeConfig?: NuxtRuntimeConfig;
}): NuxtExtensionBootstrapLogEvent {
  const providerSelection = input.providerSelectionRuntimeConfig
    ? getNuxtProviderSelection(input.providerSelectionRuntimeConfig)
    : undefined;

  return {
    bootstrap: input.bootstrap,
    ...(providerSelection ? { providerSelection } : {}),
  };
}

export function formatNuxtExtensionBootstrapLog(event: NuxtExtensionBootstrapLogEvent): string {
  const lines = ['LORION Nuxt'];
  const bootstrap = event.bootstrap;
  const extensionSelection = getNuxtExtensionSelection(bootstrap.publicRuntimeConfig);

  if (hasLogIds(bootstrap.selectedExtensions)) {
    lines.push(`Selected: ${joinLogIds(bootstrap.selectedExtensions)}`);
  }

  if (hasLogIds(bootstrap.baseExtensionIds)) {
    lines.push(`Base: ${joinLogIds(bootstrap.baseExtensionIds)}`);
  }

  lines.push(`Descriptors found: ${bootstrap.discoveredExtensions.length}`);

  if (hasLogIds(bootstrap.resolvedExtensionIds)) {
    lines.push(`Injected: ${joinLogIds(bootstrap.resolvedExtensionIds)}`);
  }

  if (hasLogIds(extensionSelection.notInjectedExtensionIds)) {
    lines.push(`Not injected: ${joinLogIds(extensionSelection.notInjectedExtensionIds)}`);
  }

  const providerSelections = Object.values(event.providerSelection?.selections ?? {}).sort(
    (left, right) => left.capabilityId.localeCompare(right.capabilityId),
  );

  for (const selection of providerSelections) {
    lines.push(`Provider ${selection.capabilityId}: ${selection.selectedProviderId}`);
  }

  return lines.join('\n');
}

export function reportNuxtExtensionBootstrap(input: {
  bootstrap: NuxtExtensionBootstrap;
  logging?: LorionNuxtModuleOptions['logging'];
  providerSelectionRuntimeConfig?: NuxtRuntimeConfig;
}): void {
  if (!input.logging || input.logging === true || !input.logging.reporter) return;

  input.logging.reporter(
    createNuxtExtensionBootstrapLogEvent({
      bootstrap: input.bootstrap,
      ...(input.providerSelectionRuntimeConfig
        ? { providerSelectionRuntimeConfig: input.providerSelectionRuntimeConfig }
        : {}),
    }),
  );
}

function getLayerRoot(layer: NuxtConfigLayer): string {
  return layer.config.rootDir ?? layer.cwd;
}

function createLayerConfig(extension: NuxtExtensionEntry): NuxtConfigLayer {
  return {
    cwd: extension.cwd,
    configFile: '',
    config: {
      rootDir: extension.cwd,
      serverDir: extension.serverDir ?? join(extension.cwd, 'server'),
      srcDir: extension.appDir ?? extension.cwd,
    },
  };
}

function registerFileOnlyExtensionLayers(
  bootstrap: NuxtExtensionBootstrap,
  nuxtOptions: NuxtOptions,
): void {
  const fileOnlyExtensions = bootstrap.activeExtensions.filter(
    (extension) => !extension.configFile,
  );

  if (!fileOnlyExtensions.length) return;

  const options = nuxtOptions as MutableNuxtOptions;
  const layers = [...options._layers];
  const existingRoots = new Set(layers.map((layer) => getLayerRoot(layer)));
  const extensionLayers = fileOnlyExtensions
    .filter((extension) => {
      if (existingRoots.has(extension.cwd)) return false;

      existingRoots.add(extension.cwd);
      return true;
    })
    .map(createLayerConfig);

  if (!extensionLayers.length) return;

  const [projectLayer, ...baseLayers] = layers;
  options._layers = projectLayer
    ? [projectLayer, ...extensionLayers, ...baseLayers]
    : [...extensionLayers];
}

const lorionNuxtModule: NuxtModule<LorionNuxtModuleOptions> =
  defineNuxtModule<LorionNuxtModuleOptions>({
    meta: {
      name: '@lorion-org/nuxt',
      configKey: 'lorion',
    },
    setup(options, nuxt) {
      const bootstrap =
        options.extensionBootstrap ??
        (options.extensions?.enabled === false || !options.extensions
          ? undefined
          : createNuxtExtensionBootstrap({
              rootDir: nuxt.options.rootDir,
              options: options.extensions,
            }));

      if (bootstrap) {
        const providerSelectionRuntimeConfig = createProviderSelectionRuntimeConfig(
          bootstrap,
          options.providers,
        );
        const logger = useLogger('@lorion-org/nuxt');
        const logging =
          options.logging === true
            ? {
                reporter: (event: NuxtExtensionBootstrapLogEvent) =>
                  logger.info(formatNuxtExtensionBootstrapLog(event)),
              }
            : options.logging;

        reportNuxtExtensionBootstrap({
          bootstrap,
          logging,
          ...(providerSelectionRuntimeConfig ? { providerSelectionRuntimeConfig } : {}),
        });
        registerFileOnlyExtensionLayers(bootstrap, nuxt.options);
        nuxt.options.runtimeConfig = mergeNuxtRuntimeConfig(
          nuxt.options.runtimeConfig,
          mergeNuxtRuntimeConfig(bootstrap.publicRuntimeConfig, providerSelectionRuntimeConfig),
        );
      }

      nuxt.options.runtimeConfig = applyRuntimeConfigModule({
        ...(bootstrap ? { bootstrap } : {}),
        currentRuntimeConfig: nuxt.options.runtimeConfig,
        nuxt,
        rootDir: nuxt.options.rootDir,
        ...(options.runtimeConfig ? { moduleOptions: options.runtimeConfig } : {}),
      });
    },
  });

export default lorionNuxtModule;
