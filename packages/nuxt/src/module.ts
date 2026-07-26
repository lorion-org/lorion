import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  addImports,
  addServerImports,
  addServerTemplate,
  addTemplate,
  addTypeTemplate,
  createResolver,
  defineNuxtModule,
  useLogger,
} from '@nuxt/kit';
import type { Nuxt, NuxtConfigLayer, NuxtModule, NuxtOptions } from '@nuxt/schema';
import { describeComposition, formatCompositionReport } from '@lorion-org/capability-composition';
import {
  createNuxtExtensionBootstrap,
  createNuxtProviderSelectionRuntimeConfig,
  createNuxtSelectedProviderPreferences,
  type NuxtExtensionBootstrap,
  type NuxtExtensionEntry,
} from './extensions';
import {
  createNuxtRuntimeConfig,
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
import {
  resolveRuntimeConfigValidationMode,
  shouldRequireRuntimeConfigAtStartup,
  type RuntimeConfigValidationMode,
  type RuntimeConfigValidationPolicyInput,
  type RuntimeConfigValidationSchemaRegistry,
} from '@lorion-org/runtime-config';
import {
  assertRequiredRuntimeConfigValidationTargets,
  readRuntimeConfigSchemaRegistry,
  type RuntimeConfigSchemaTargetInput,
  type RuntimeConfigValidateResult,
} from '@lorion-org/runtime-config-node';

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
  'useValidatedRuntimeConfigFragment',
  'useRuntimeConfigScope',
  'useValidatedRuntimeConfigScope',
  'usePublicRuntimeConfigScope',
  'usePublicValidatedRuntimeConfigScope',
  'usePrivateRuntimeConfigScope',
  'usePrivateValidatedRuntimeConfigScope',
  'useRuntimeConfigValue',
] as const;

const runtimeConfigComposablesTemplate = 'lorion/runtime-config-composables.mjs';
const runtimeConfigComposablesImport = '#build/lorion/runtime-config-composables';
const serverRuntimeConfigComposablesTemplate = '#internal/lorion-runtime-config-composables.mjs';

const defaultRuntimeConfigSource = {
  contextInputKey: 'contexts',
  contextOutputKey: '__contexts',
  paths: ['.runtimeconfig/runtime-config/*/runtime.config.json'],
} as const;

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
  validationSchemas: RuntimeConfigValidationSchemaRegistry;
  runtimeConfigFrom: string;
  typed: boolean;
  useRuntimeConfigFrom: string;
}): string {
  const validationSchemasSource = JSON.stringify(input.validationSchemas);
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
import { createRuntimeConfigValidatorRegistry } from '@lorion-org/runtime-config'
import {
  getNuxtRuntimeConfigFragment,
  getNuxtRuntimeConfigScope,
  getPrivateNuxtRuntimeConfigScope,
  getPublicNuxtRuntimeConfigScope,
  resolveNuxtRuntimeConfigValue,
} from '${input.runtimeConfigFrom}'
${typeImports}
const runtimeConfigDefaultsKey = '__lorionNuxt'
const runtimeConfigValidationSchemas = ${validationSchemasSource}
const runtimeConfigValidatorRegistry = createRuntimeConfigValidatorRegistry(runtimeConfigValidationSchemas)

function assertValidatedRuntimeConfigFragment(scopeId, fragment) {
  runtimeConfigValidatorRegistry.assert(scopeId, fragment)
}

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

export function useValidatedRuntimeConfigFragment(scopeId, options${typeAnnotations.fragmentOptions} = {})${typeAnnotations.fragmentReturn} {
  const runtimeConfig = useRuntimeConfig()
  const fragment = getNuxtRuntimeConfigFragment(runtimeConfig, scopeId, withComposableDefaults(runtimeConfig, options))

  assertValidatedRuntimeConfigFragment(scopeId, fragment)

  return fragment
}

export function useRuntimeConfigScope${typeAnnotations.scopeReturn}(scopeId, options${typeAnnotations.scopeOptions} = {}) {
  const runtimeConfig = useRuntimeConfig()

  return getNuxtRuntimeConfigScope(runtimeConfig, scopeId, withComposableDefaults(runtimeConfig, options))
}

export function useValidatedRuntimeConfigScope${typeAnnotations.scopeReturn}(scopeId, options${typeAnnotations.scopeOptions} = {}) {
  const runtimeConfig = useRuntimeConfig()

  assertValidatedRuntimeConfigFragment(
    scopeId,
    getNuxtRuntimeConfigFragment(runtimeConfig, scopeId, withComposableDefaults(runtimeConfig, options)),
  )

  return getNuxtRuntimeConfigScope(runtimeConfig, scopeId, withComposableDefaults(runtimeConfig, options))
}

export function usePublicRuntimeConfigScope${typeAnnotations.scopeReturn}(scopeId, options${typeAnnotations.publicOptions} = {}) {
  const runtimeConfig = useRuntimeConfig()

  return getPublicNuxtRuntimeConfigScope(runtimeConfig, scopeId, withComposableDefaults(runtimeConfig, options))
}

export function usePublicValidatedRuntimeConfigScope${typeAnnotations.scopeReturn}(scopeId, options${typeAnnotations.publicOptions} = {}) {
  const runtimeConfig = useRuntimeConfig()

  assertValidatedRuntimeConfigFragment(
    scopeId,
    getNuxtRuntimeConfigFragment(runtimeConfig, scopeId, withComposableDefaults(runtimeConfig, options)),
  )

  return getPublicNuxtRuntimeConfigScope(runtimeConfig, scopeId, withComposableDefaults(runtimeConfig, options))
}

export function usePrivateRuntimeConfigScope${typeAnnotations.scopeReturn}(scopeId, options${typeAnnotations.privateOptions} = {}) {
  const runtimeConfig = useRuntimeConfig()

  return getPrivateNuxtRuntimeConfigScope(runtimeConfig, scopeId, withComposableDefaults(runtimeConfig, options))
}

export function usePrivateValidatedRuntimeConfigScope${typeAnnotations.scopeReturn}(scopeId, options${typeAnnotations.privateOptions} = {}) {
  const runtimeConfig = useRuntimeConfig()

  assertValidatedRuntimeConfigFragment(
    scopeId,
    getNuxtRuntimeConfigFragment(runtimeConfig, scopeId, withComposableDefaults(runtimeConfig, options)),
  )

  return getPrivateNuxtRuntimeConfigScope(runtimeConfig, scopeId, withComposableDefaults(runtimeConfig, options))
}

export function useRuntimeConfigValue${typeAnnotations.valueOptions}(scopeId, key, options${typeAnnotations.valueOptionsType} = {})${typeAnnotations.valueReturn} {
  const runtimeConfig = useRuntimeConfig()

  return resolveNuxtRuntimeConfigValue(runtimeConfig, scopeId, key, withComposableDefaults(runtimeConfig, options))
}
`;
}

function createRuntimeConfigComposablesTypesSource(): string {
  return `declare module '${runtimeConfigComposablesImport}' {
  import type {
    GetRuntimeConfigFragmentOptions,
    GetRuntimeConfigScopeOptions,
    ResolveRuntimeConfigValueFromRuntimeConfigOptions,
    RuntimeConfigContext,
    RuntimeConfigSection,
  } from '@lorion-org/runtime-config'

  type NuxtPrivateRuntimeConfigMode = 'root' | 'section'
  type ReadNuxtRuntimeConfigOptions = {
    privateInput?: NuxtPrivateRuntimeConfigMode
  }

  export function useRuntimeConfigFragment(
    scopeId: string,
    options?: GetRuntimeConfigFragmentOptions & ReadNuxtRuntimeConfigOptions,
  ): RuntimeConfigContext
  export function useValidatedRuntimeConfigFragment(
    scopeId: string,
    options?: GetRuntimeConfigFragmentOptions & ReadNuxtRuntimeConfigOptions,
  ): RuntimeConfigContext
  export function useRuntimeConfigScope<T extends RuntimeConfigSection = RuntimeConfigSection>(
    scopeId: string,
    options?: GetRuntimeConfigScopeOptions & ReadNuxtRuntimeConfigOptions,
  ): T
  export function useValidatedRuntimeConfigScope<
    T extends RuntimeConfigSection = RuntimeConfigSection,
  >(scopeId: string, options?: GetRuntimeConfigScopeOptions & ReadNuxtRuntimeConfigOptions): T
  export function usePublicRuntimeConfigScope<
    T extends RuntimeConfigSection = RuntimeConfigSection,
  >(
    scopeId: string,
    options?: Omit<GetRuntimeConfigScopeOptions, 'visibility'> & ReadNuxtRuntimeConfigOptions,
  ): T
  export function usePublicValidatedRuntimeConfigScope<
    T extends RuntimeConfigSection = RuntimeConfigSection,
  >(
    scopeId: string,
    options?: Omit<GetRuntimeConfigScopeOptions, 'visibility'> & ReadNuxtRuntimeConfigOptions,
  ): T
  export function usePrivateRuntimeConfigScope<
    T extends RuntimeConfigSection = RuntimeConfigSection,
  >(
    scopeId: string,
    options?: Omit<GetRuntimeConfigScopeOptions, 'visibility'> & ReadNuxtRuntimeConfigOptions,
  ): T
  export function usePrivateValidatedRuntimeConfigScope<
    T extends RuntimeConfigSection = RuntimeConfigSection,
  >(
    scopeId: string,
    options?: Omit<GetRuntimeConfigScopeOptions, 'visibility'> & ReadNuxtRuntimeConfigOptions,
  ): T
  export function useRuntimeConfigValue<T = unknown>(
    scopeId: string,
    key: string,
    options?: ResolveRuntimeConfigValueFromRuntimeConfigOptions<T> & ReadNuxtRuntimeConfigOptions,
  ): T | undefined
}

declare module '${serverRuntimeConfigComposablesTemplate}' {
  export * from '${runtimeConfigComposablesImport}'
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
    bootstrap?.resolvedExtensions
      .filter((extension) => extension.descriptor.runtimeConfig !== undefined)
      .map((extension) => ({
        scopeId: extension.descriptor.id,
        cwd: extension.cwd,
        policy: extension.descriptor.runtimeConfig,
      })) ?? []
  );
}

function createRuntimeConfigValidationSchemas(
  options: RuntimeConfigNuxtModuleOptions,
  bootstrap?: NuxtExtensionBootstrap,
): RuntimeConfigValidationSchemaRegistry {
  if (options.validation === false || !options.validation) return {};

  return readRuntimeConfigSchemaRegistry(resolveRuntimeConfigValidationTargets(bootstrap), {
    ...(options.validation.schemaFileName
      ? { schemaFileName: options.validation.schemaFileName }
      : {}),
  });
}

function createRuntimeConfigValidationPolicyByScope(
  targets: RuntimeConfigSchemaTargetInput[],
): Map<string, RuntimeConfigValidationPolicyInput> {
  return new Map(targets.map((target) => [target.scopeId, target.policy]));
}

function formatRuntimeConfigValidationMode(
  policy: RuntimeConfigValidationPolicyInput,
): RuntimeConfigValidationMode {
  return resolveRuntimeConfigValidationMode(policy);
}

function isRuntimeConfigValidationFatal(
  scopeId: string,
  policyByScope: Map<string, RuntimeConfigValidationPolicyInput>,
): boolean {
  return shouldRequireRuntimeConfigAtStartup(policyByScope.get(scopeId));
}

function formatRuntimeConfigSkippedValidationDetails(
  skipped: RuntimeConfigValidateResult['skipped'][number],
  mode: RuntimeConfigValidationMode,
): string {
  if (skipped.reason === 'missing-schema') {
    return [
      `RuntimeConfig schema file missing for "${skipped.scopeId}" (${mode}).`,
      ...(skipped.schemaPath ? [`missing schema file: ${skipped.schemaPath}`] : []),
      ...(skipped.configPath ? [`runtime config file: ${skipped.configPath}`] : []),
    ].join(' ');
  }

  if (skipped.reason === 'missing-config') {
    return [
      `RuntimeConfig file missing for "${skipped.scopeId}" (${mode}).`,
      ...(skipped.configPath ? [`expected runtime config file: ${skipped.configPath}`] : []),
      ...(skipped.schemaPath ? [`schema file: ${skipped.schemaPath}`] : []),
    ].join(' ');
  }

  return [
    `RuntimeConfig validation target has no schema directory for "${skipped.scopeId}" (${mode}).`,
    ...(skipped.configPath ? [`runtime config file: ${skipped.configPath}`] : []),
    ...(skipped.schemaPath ? [`schema file: ${skipped.schemaPath}`] : []),
  ].join(' ');
}

function reportRuntimeConfigValidationResult(
  result: RuntimeConfigValidateResult,
  targets: RuntimeConfigSchemaTargetInput[],
): void {
  if (!result.skipped.length && !result.invalid.length) return;

  const logger = useLogger('lorion');
  const policyByScope = createRuntimeConfigValidationPolicyByScope(targets);

  for (const skipped of result.skipped) {
    const fatal = isRuntimeConfigValidationFatal(skipped.scopeId, policyByScope);
    const mode = formatRuntimeConfigValidationMode(policyByScope.get(skipped.scopeId));
    const details = formatRuntimeConfigSkippedValidationDetails(skipped, mode);

    logger[fatal ? 'error' : 'warn'](details);
  }

  for (const invalid of result.invalid) {
    const fatal = isRuntimeConfigValidationFatal(invalid.scopeId, policyByScope);
    const mode = formatRuntimeConfigValidationMode(policyByScope.get(invalid.scopeId));

    logger[fatal ? 'error' : 'warn'](
      [
        `RuntimeConfig validation failed for "${invalid.scopeId}" (${mode}).`,
        `runtime config file: ${invalid.configPath}`,
        `schema file: ${invalid.schemaPath}`,
        invalid.error.message,
      ].join(' '),
    );
  }
}

function validateRuntimeConfigSource(
  options: RuntimeConfigNuxtModuleOptions,
  bootstrap?: NuxtExtensionBootstrap,
): void {
  if (!options.source || options.validation === false || !options.validation) return;
  const targets = resolveRuntimeConfigValidationTargets(bootstrap);

  if (!targets.length) return;

  const result = validateNuxtRuntimeConfigSourceScopes(options.source, targets, {
    ...(options.validation.formatError ? { formatError: options.validation.formatError } : {}),
    ...(options.validation.schemaFileName
      ? { schemaFileName: options.validation.schemaFileName }
      : {}),
  });

  reportRuntimeConfigValidationResult(result, targets);
  assertRequiredRuntimeConfigValidationTargets(result, targets);
}

function addRuntimeConfigComposables(
  options: RuntimeConfigNuxtModuleOptions,
  bootstrap?: NuxtExtensionBootstrap,
  hostImports?: { scan?: unknown },
  registerImports = true,
): void {
  const resolver = createResolver(import.meta.url);
  const runtimeConfigFrom = normalizeImportPath(resolver.resolve('./runtime-config'));
  const validationSchemas = createRuntimeConfigValidationSchemas(options, bootstrap);
  addTemplate({
    filename: runtimeConfigComposablesTemplate,
    write: true,
    getContents: () =>
      createRuntimeConfigComposablesSource({
        runtimeConfigFrom,
        typed: false,
        useRuntimeConfigFrom: 'nuxt/app',
        validationSchemas,
      }),
  });
  addTypeTemplate(
    {
      filename: 'types/lorion-runtime-config-composables.d.ts',
      getContents: createRuntimeConfigComposablesTypesSource,
    },
    { nitro: true, nuxt: true },
  );

  addServerTemplate({
    filename: serverRuntimeConfigComposablesTemplate,
    getContents: () =>
      createRuntimeConfigComposablesSource({
        runtimeConfigFrom,
        typed: false,
        useRuntimeConfigFrom: 'nitropack/runtime',
        validationSchemas,
      }),
  });

  const imports = runtimeConfigImportNames.map((name) => ({
    as: name,
    from: runtimeConfigComposablesImport,
    name,
  }));
  const serverImports = runtimeConfigImportNames.map((name) => ({
    as: name,
    from: serverRuntimeConfigComposablesTemplate,
    name,
  }));

  if (!registerImports) return;
  if (!shouldRegisterRuntimeConfigImports(options, hostImports)) return;

  addImports(imports);
  addServerImports(serverImports);
}

export function shouldRegisterRuntimeConfigImports(
  options: Pick<RuntimeConfigNuxtModuleOptions, 'imports'>,
  hostImports?: { scan?: unknown },
): boolean {
  if (options.imports !== undefined) return options.imports;

  return hostImports?.scan !== false;
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

  addRuntimeConfigComposables(
    runtimeConfigOptions ?? {},
    input.bootstrap,
    input.nuxt.options.imports,
    Boolean(runtimeConfigOptions),
  );

  if (!runtimeConfigOptions) return input.currentRuntimeConfig;

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

  return createNuxtProviderSelectionRuntimeConfig(bootstrap.resolvedExtensions, {
    ...options,
    selectedProviders: {
      ...createNuxtSelectedProviderPreferences({
        entries: bootstrap.resolvedExtensions,
        selectedExtensions: bootstrap.selectedExtensions,
      }),
      ...(options?.selectedProviders ?? {}),
    },
  });
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

// Rendered from the shared composition report, so a Nuxt host and every other
// host describe a resolution the same way. What stays here is this adapter's own
// framing: the header line and, below, whether anything is logged at all.
export function formatNuxtExtensionBootstrapLog(event: NuxtExtensionBootstrapLogEvent): string {
  const bootstrap = event.bootstrap;
  const report = describeComposition({
    requested: bootstrap.requestedExtensions,
    selected: bootstrap.selectedExtensions,
    base: bootstrap.baseExtensionIds,
    resolved: bootstrap.resolvedExtensionIds,
    discovered: bootstrap.discoveredExtensions.map((extension) => extension.descriptor.id),
    providers: Object.values(event.providerSelection?.selections ?? {}),
  });
  return ['LORION Nuxt', ...formatCompositionReport(report)].join('\n');
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
