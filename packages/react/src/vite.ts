import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { loadEnv } from 'vite';
import type {
  CompositionPolicy,
  Descriptor,
  DescriptorId,
  DescriptorSelectionSeedInput,
  RelationDescriptor,
} from '@lorion-org/composition-graph';
import {
  descriptorSchema,
  discoverDescriptors,
  requirePackageName,
  type DiscoveredDescriptor,
} from '@lorion-org/descriptor-discovery';
import { resolveDescriptorSelection, selectDescriptors } from '@lorion-org/descriptor-selection';
import {
  createRuntimeConfigValidatorRegistry,
  projectRuntimeConfigNamespaces,
  resolveRuntimeConfigValidationMode,
  toRuntimeConfigFragment,
  toSnakeUpperCase,
  type RuntimeConfigFragment,
  type RuntimeConfigFragmentMap,
  type RuntimeConfigSection,
  type RuntimeConfigValidationPolicyInput,
} from '@lorion-org/runtime-config';
import {
  loadRuntimeConfigSourceTree,
  readJsonFile,
  resolveRuntimeConfigSource as resolveRuntimeConfigVarDirSource,
  type RuntimeConfigPathPatternSource,
  type RuntimeConfigSchemaValidationErrorFormatter,
} from '@lorion-org/runtime-config-node';
import { capabilitySpecifier, type ActivationResolver } from '@lorion-org/surface-activation';

const virtualModuleId = 'virtual:capabilities';
const resolvedVirtualModuleId = `\0${virtualModuleId}`;
const runtimeConfigModuleId = 'virtual:capability-runtime-config';
const resolvedRuntimeConfigModuleId = `\0${runtimeConfigModuleId}`;
const serverRuntimeConfigModuleId = 'virtual:capability-runtime-config/server';
const resolvedServerRuntimeConfigModuleId = `\0${serverRuntimeConfigModuleId}`;
const defaultRuntimeConfigFileName = 'capability.runtime.json';
const defaultRuntimeConfigSchemaFileName = 'capability.schema.json';

export type CapabilityActivationEntry = {
  exportName?: string;
  exportSubpath?: string;
};

// Returning a nullish activation marks the capability as graph-only: it takes
// part in dependency resolution but activates nothing (no import is emitted).
export type ResolveCapabilityActivation = (input: {
  capabilityDir: string;
  descriptor: Descriptor;
  packageJson: Record<string, unknown>;
  packageName: string;
}) => CapabilityActivationEntry | null | undefined;

export type CapabilityLoaderOptions = {
  // How an active capability's activation is resolved (which module and export to
  // import). Pass EITHER `surface` to reuse a lorion `conventionActivation` resolver
  // for a named surface directly (no per-host adapter), OR the richer `activation`
  // resolver that also sees the descriptor and package.json — not both. A nullish
  // result marks the capability graph-only.
  activation?: ResolveCapabilityActivation;
  // Reuse a `conventionActivation` resolver (from `@lorion-org/surface-activation`)
  // for a named surface, e.g. `{ name: 'web', resolver: conventionActivation({...}) }`.
  surface?: { name: string; resolver: ActivationResolver };
  capabilitiesDir?: string;
  baseDescriptors?: readonly DescriptorId[];
  defaultSelection?: readonly DescriptorId[];
  policy?: Partial<CompositionPolicy>;
  relationDescriptors?: readonly RelationDescriptor[];
  runtimeConfig?: false | ReactRuntimeConfigOptions;
  selected?: readonly DescriptorId[];
  selectionSeed?: false | CapabilitySelectionSeedOptions;
  workspaceRoot?: string;
};

export type CapabilitySelectionSeedOptions = Omit<DescriptorSelectionSeedInput, 'defaultValue'>;

export type ReactRuntimeConfigEnvOptions = {
  env?: Record<string, string | undefined>;
  privatePrefix?: string;
  publicPrefix?: string;
};

export type ReactRuntimeConfigValidationOptions = {
  formatError?: RuntimeConfigSchemaValidationErrorFormatter;
  policy?: RuntimeConfigValidationPolicyInput;
  schemaFileName?: string;
};

export type ReactRuntimeConfigVarDirOptions = {
  defaultValue?: string;
  env?: Record<string, string | undefined>;
  envKey?: string;
  value?: string;
};

export type ReactRuntimeConfigOptions = {
  configFileName?: string;
  enabled?: boolean;
  env?: false | ReactRuntimeConfigEnvOptions;
  schemaFileName?: string;
  source?: false | RuntimeConfigPathPatternSource;
  validation?: false | ReactRuntimeConfigValidationOptions;
  varDir?: string | ReactRuntimeConfigVarDirOptions;
};

export type ReactRuntimeConfig = {
  private: Record<string, RuntimeConfigSection>;
  public: Record<string, RuntimeConfigSection>;
};

export type CapabilityRouteConfigOptions = CapabilityLoaderOptions & {
  indexRouteFile?: false | string;
  routesDirectory: string;
  workspaceRoot: string;
};

export type LorionReactViteOptions = CapabilityRouteConfigOptions;

export type LorionReactViteSetup = {
  capabilityLoader: VitePlugin;
  routeConfig: VirtualRootRoute;
};

export type DiscoveredCapability = {
  capabilityDir: string;
  disabled: boolean;
  entryFile?: string;
  // Absent for graph-only capabilities that resolve but do not activate.
  exportName?: string;
  id: string;
  importSpecifier?: string;
  manifest: Descriptor;
  packageName: string;
  routesDirectory?: string;
  variableName: string;
};

export type VirtualIndexRoute = {
  file: string;
  type: 'index';
};

export type VirtualPhysicalRouteSubtree = {
  directory: string;
  pathPrefix: string;
  type: 'physical';
};

export type VirtualRootRoute = {
  children: Array<VirtualIndexRoute | VirtualPhysicalRouteSubtree>;
  file: string;
  type: 'root';
};

export type ViteResolvedConfig = {
  env?: Record<string, string | undefined>;
  envDir?: false | string;
  mode?: string;
  root: string;
};

export type VitePlugin = {
  configResolved: (resolvedConfig: ViteResolvedConfig) => void;
  enforce: 'pre';
  load: (id: string, options?: { ssr?: boolean | undefined }) => string | null;
  name: string;
  resolveId: (id: string) => string | undefined;
};

export function capabilityLoader(options: CapabilityLoaderOptions = {}): VitePlugin {
  let config: ViteResolvedConfig;
  let capabilities: DiscoveredCapability[] = [];
  let runtimeConfig: ReactRuntimeConfig = { private: {}, public: {} };

  return {
    name: 'lorion-react-capability-loader',
    enforce: 'pre',
    configResolved(resolvedConfig) {
      config = resolvedConfig;
      capabilities = discoverSelectedCapabilities(
        resolveWorkspaceRoot(config.root, options),
        options,
      );
      runtimeConfig = createReactRuntimeConfig(
        capabilities,
        resolveWorkspaceRoot(config.root, options),
        options.runtimeConfig,
        config,
      );
    },
    resolveId(id) {
      if (id === virtualModuleId) return resolvedVirtualModuleId;
      if (id === runtimeConfigModuleId) return resolvedRuntimeConfigModuleId;
      if (id === serverRuntimeConfigModuleId) return resolvedServerRuntimeConfigModuleId;

      return capabilities.find((capability) => capability.importSpecifier === id)?.entryFile;
    },
    load(id, loadOptions) {
      if (id === resolvedRuntimeConfigModuleId) return renderRuntimeConfigModule(runtimeConfig);
      if (id === resolvedServerRuntimeConfigModuleId) {
        if (!loadOptions?.ssr) {
          throw new Error(
            'virtual:capability-runtime-config/server may only be imported from SSR/server code.',
          );
        }

        return renderServerRuntimeConfigModule(runtimeConfig);
      }
      if (id !== resolvedVirtualModuleId) return null;

      return renderCapabilityModule(capabilities, resolveSelectionSeed(options));
    },
  };
}

export function createReactRuntimeConfig(
  capabilities: readonly DiscoveredCapability[],
  workspaceRoot: string,
  options: false | ReactRuntimeConfigOptions = {},
  viteConfig: Partial<ViteResolvedConfig> = {},
): ReactRuntimeConfig {
  const normalizedOptions = normalizeRuntimeConfigOptions(options);
  if (!normalizedOptions.enabled) return { private: {}, public: {} };

  const runtimeEnv = resolveRuntimeConfigEnv(viteConfig, normalizedOptions.env ?? {});
  const sourceFragments = normalizedOptions.source
    ? loadRuntimeConfigSourceTree(
        resolveRuntimeConfigPatternSource(workspaceRoot, normalizedOptions, runtimeEnv),
      )
    : new Map<string, RuntimeConfigFragment>();
  const schemaEntries = readRuntimeConfigSchemas(capabilities, normalizedOptions.schemaFileName);
  const envFragments =
    normalizedOptions.env === false
      ? new Map<string, RuntimeConfigFragment>()
      : createRuntimeConfigEnvFragments(
          createRuntimeConfigEnvFragmentOptions(
            capabilities,
            schemaEntries.schemas,
            runtimeEnv,
            normalizedOptions.env,
          ),
        );
  const fragments = mergeRuntimeConfigFragmentMaps(sourceFragments, envFragments);

  validateReactRuntimeConfig(capabilities, fragments, schemaEntries, normalizedOptions.validation);

  const projected = projectRuntimeConfigNamespaces(fragments, {
    namespaceStrategy: 'nested',
    scopeIds: capabilities.map((capability) => capability.id),
  });
  const { public: publicConfig, ...privateConfig } = projected;

  return {
    public: publicConfig as Record<string, RuntimeConfigSection>,
    private: privateConfig as Record<string, RuntimeConfigSection>,
  };
}

export function lorionReact(options: LorionReactViteOptions): LorionReactViteSetup {
  return {
    capabilityLoader: capabilityLoader(options),
    routeConfig: createCapabilityRouteConfig(options),
  };
}

// Normalizes the activation option into a ResolveCapabilityActivation. With
// `surface`, `resolver` is a lorion ActivationResolver (from conventionActivation)
// resolved for that surface, so a host reuses the shared surface convention
// directly with no adapter. Without `surface`, it is the richer `activation`
// resolver. The two are mutually exclusive.
function toResolveActivation(
  options: Pick<CapabilityLoaderOptions, 'activation' | 'surface'>,
): ResolveCapabilityActivation | undefined {
  if (options.surface) {
    if (options.activation) {
      throw new Error('capabilityLoader: pass either `surface` or `activation`, not both.');
    }
    const { name, resolver } = options.surface;
    return ({ capabilityDir, descriptor }) =>
      resolver(name, { directory: capabilityDir, id: descriptor.id });
  }
  return options.activation;
}

export function discoverCapabilities(
  workspaceRoot: string,
  options: Pick<CapabilityLoaderOptions, 'activation' | 'capabilitiesDir' | 'surface'> = {},
): DiscoveredCapability[] {
  const capabilitiesRoot = resolve(workspaceRoot, options.capabilitiesDir ?? 'capabilities');

  if (!existsSync(capabilitiesRoot)) {
    throw new Error(`Capabilities directory not found: ${capabilitiesRoot}`);
  }

  const resolveActivation = toResolveActivation(options);
  return discoverCapabilityDescriptors(workspaceRoot, options)
    .map((entry) => discoverCapability(entry, resolveActivation))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function discoverSelectedCapabilities(
  workspaceRoot: string,
  options: CapabilityLoaderOptions = {},
): DiscoveredCapability[] {
  return selectCapabilities(discoverCapabilities(workspaceRoot, options), options);
}

function selectCapabilities(
  capabilities: readonly DiscoveredCapability[],
  options: Pick<
    CapabilityLoaderOptions,
    | 'baseDescriptors'
    | 'defaultSelection'
    | 'policy'
    | 'relationDescriptors'
    | 'selected'
    | 'selectionSeed'
  > = {},
): DiscoveredCapability[] {
  return selectDescriptors({
    items: capabilities,
    getDescriptor: (capability) => capability.manifest,
    withDescriptor: (capability, manifest) => ({ ...capability, manifest }),
    seed: options,
    ...(options.relationDescriptors ? { relationDescriptors: options.relationDescriptors } : {}),
    ...(options.policy ? { policy: options.policy } : {}),
  });
}

function resolveSelectionSeed(
  options: Pick<CapabilityLoaderOptions, 'defaultSelection' | 'selected' | 'selectionSeed'>,
): DescriptorId[] {
  return resolveDescriptorSelection(options);
}

export function renderCapabilityModule(
  capabilities: readonly DiscoveredCapability[],
  selected: readonly DescriptorId[] = [],
): string {
  // Only capabilities with a resolved activation entry are imported and
  // registered. Graph-only capabilities take part in dependency resolution and
  // still appear in resolvedCapabilityIds, but emit no import.
  const activated = capabilities.filter(
    (capability) => capability.exportName && capability.importSpecifier,
  );
  const imports = activated
    .map(
      (capability) =>
        `import { ${capability.exportName} as ${capability.variableName} } from '${capability.importSpecifier}'`,
    )
    .join('\n');
  const variables = activated.map((capability) => `  ${capability.variableName},`).join('\n');
  const capabilityIds = capabilities.map((capability) => capability.id);

  return `${imports}

export const selectedCapabilityIds = ${JSON.stringify([...selected])}

export const resolvedCapabilityIds = ${JSON.stringify(capabilityIds)}

export const capabilityModules = [
${variables}
]
`;
}

export function renderRuntimeConfigModule(runtimeConfig: ReactRuntimeConfig): string {
  return `export const capabilityRuntimeConfig = ${JSON.stringify({ public: runtimeConfig.public })}

export const publicCapabilityRuntimeConfig = capabilityRuntimeConfig.public
`;
}

export function renderServerRuntimeConfigModule(runtimeConfig: ReactRuntimeConfig): string {
  return `export const capabilityServerRuntimeConfig = ${JSON.stringify(runtimeConfig)}
`;
}

export function createCapabilityRouteConfig(
  options: CapabilityRouteConfigOptions,
): VirtualRootRoute {
  if (!options?.workspaceRoot) {
    throw new Error('createCapabilityRouteConfig requires a workspaceRoot option.');
  }

  if (!options?.routesDirectory) {
    throw new Error('createCapabilityRouteConfig requires a routesDirectory option.');
  }

  const routesDirectory = resolve(options.routesDirectory);
  const capabilities = discoverSelectedCapabilities(options.workspaceRoot, options);
  const capabilityRouteSubtrees = capabilities
    .filter(hasRouteDirectory)
    .filter((capability) => capability.disabled !== true)
    .map((capability) => ({
      type: 'physical' as const,
      pathPrefix: '',
      directory: toPosixPath(relative(routesDirectory, capability.routesDirectory)),
    }));

  return {
    type: 'root',
    file: '__root.tsx',
    children: [
      ...(options.indexRouteFile === false
        ? []
        : [
            {
              type: 'index' as const,
              file: options.indexRouteFile ?? 'index.tsx',
            },
          ]),
      ...capabilityRouteSubtrees,
    ],
  };
}

function discoverCapabilityDescriptors(
  workspaceRoot: string,
  options: Pick<CapabilityLoaderOptions, 'capabilitiesDir'>,
): DiscoveredDescriptor[] {
  const capabilitiesDir = options.capabilitiesDir ?? 'capabilities';

  return discoverDescriptors({
    cwd: workspaceRoot,
    descriptorPaths: [`${capabilitiesDir}/*/capability.json`],
    validation: {
      schema: descriptorSchema,
    },
  });
}

function discoverCapability(
  entry: DiscoveredDescriptor,
  resolveActivation?: ResolveCapabilityActivation,
): DiscoveredCapability {
  const capabilityDir = entry.cwd;
  const packagePath = resolve(capabilityDir, 'package.json');

  if (!existsSync(packagePath)) {
    throw new Error(
      `Capability must define both capability.json and package.json: ${capabilityDir}`,
    );
  }

  const packageJson = readJson(packagePath);
  const packageName = requirePackageName(packageJson, packagePath);

  const activationEntry = resolveActivationEntry(
    capabilityDir,
    packageJson,
    packageName,
    entry.descriptor,
    resolveActivation,
  );
  const routesDirectory = resolveRouteDirectory(capabilityDir);

  return {
    capabilityDir,
    id: entry.descriptor.id,
    disabled: entry.descriptor.disabled === true,
    manifest: entry.descriptor,
    packageName,
    ...(activationEntry
      ? {
          exportName: activationEntry.exportName,
          importSpecifier: activationEntry.importSpecifier,
          ...(activationEntry.entryFile ? { entryFile: activationEntry.entryFile } : {}),
        }
      : {}),
    ...(routesDirectory ? { routesDirectory } : {}),
    variableName: toVariableName(entry.descriptor.id),
  };
}

type NormalizedReactRuntimeConfigOptions = {
  configFileName: string;
  enabled: boolean;
  env: false | ReactRuntimeConfigEnvOptions;
  schemaFileName: string;
  source?: RuntimeConfigPathPatternSource;
  validation: false | ReactRuntimeConfigValidationOptions;
  varDir?: string | ReactRuntimeConfigVarDirOptions;
};

type RuntimeConfigSchemaEntries = {
  paths: Map<string, string>;
  schemas: Record<string, object>;
};

function normalizeRuntimeConfigOptions(
  options: false | ReactRuntimeConfigOptions,
): NormalizedReactRuntimeConfigOptions {
  if (options === false) {
    return {
      configFileName: defaultRuntimeConfigFileName,
      enabled: false,
      env: false,
      schemaFileName: defaultRuntimeConfigSchemaFileName,
      validation: false,
    };
  }

  const configFileName = options.configFileName ?? defaultRuntimeConfigFileName;

  return {
    configFileName,
    enabled: options.enabled !== false,
    env: options.env ?? {},
    schemaFileName: options.schemaFileName ?? defaultRuntimeConfigSchemaFileName,
    ...(options.source === false
      ? {}
      : {
          source: options.source ?? { paths: [] },
        }),
    validation: options.validation === false ? false : (options.validation ?? {}),
    ...(options.varDir ? { varDir: options.varDir } : {}),
  };
}

function resolveRuntimeConfigPatternSource(
  workspaceRoot: string,
  options: Pick<NormalizedReactRuntimeConfigOptions, 'configFileName' | 'source' | 'varDir'>,
  env: Record<string, string | undefined>,
): RuntimeConfigPathPatternSource {
  if (!options.source?.paths.length) {
    const varDir = resolveRuntimeConfigVarDir(workspaceRoot, options.varDir, env);

    return {
      paths: [join(varDir, 'runtime-config', '*', options.configFileName)],
    };
  }

  return {
    paths: options.source.paths.map((entry: string) =>
      isAbsolute(entry) ? entry : resolve(workspaceRoot, entry),
    ),
  };
}

function resolveRuntimeConfigVarDir(
  workspaceRoot: string,
  options: string | ReactRuntimeConfigVarDirOptions | undefined,
  env: Record<string, string | undefined>,
): string {
  const rawVarDir =
    typeof options === 'string'
      ? options
      : resolveRuntimeConfigVarDirSource({
          defaultVarDir: resolve(workspaceRoot, '.data'),
          env: options?.env ?? env,
          envKey: options?.envKey ?? 'RUNTIME_CONFIG_VAR_DIR',
          ...(options?.value ? { varDir: options.value } : {}),
          ...(options?.defaultValue ? { defaultVarDir: options.defaultValue } : {}),
        }).varDir;

  return isAbsolute(rawVarDir) ? rawVarDir : resolve(workspaceRoot, rawVarDir);
}

function resolveRuntimeConfigEnv(
  viteConfig: Partial<ViteResolvedConfig>,
  options: ReactRuntimeConfigEnvOptions | false,
): Record<string, string | undefined> {
  if (options === false) return {};
  if (options.env) return options.env;

  const mode = viteConfig.mode ?? process.env.NODE_ENV ?? 'development';
  const envDir =
    typeof viteConfig.envDir === 'string' ? viteConfig.envDir : (viteConfig.root ?? process.cwd());

  return {
    ...loadEnv(mode, envDir, ''),
    ...process.env,
    ...(viteConfig.env ?? {}),
  };
}

function readRuntimeConfigSchemas(
  capabilities: readonly DiscoveredCapability[],
  schemaFileName: string,
): RuntimeConfigSchemaEntries {
  const paths = new Map<string, string>();
  const schemas: Record<string, object> = {};

  for (const capability of capabilities) {
    const schemaPath = resolve(capability.capabilityDir, schemaFileName);
    const schema = readJsonFile<object>(schemaPath, {
      onParseError: (error, filePath) => {
        throw new Error(`RuntimeConfig schema JSON parse error in "${filePath}": ${String(error)}`);
      },
    });

    if (!schema) continue;

    paths.set(capability.id, schemaPath);
    schemas[capability.id] = schema;
  }

  return { paths, schemas };
}

function isJsonSchemaObject(value: unknown): value is { properties?: Record<string, unknown> } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRuntimeConfigSchemaSectionKeys(
  schema: object | undefined,
  visibility: string,
): string[] {
  if (!isJsonSchemaObject(schema)) return [];

  const section = schema.properties?.[visibility];
  if (!isJsonSchemaObject(section) || !isJsonSchemaObject(section.properties)) return [];

  return Object.keys(section.properties).sort();
}

function createRuntimeConfigEnvKey(input: {
  key: string;
  prefix?: string;
  scopeId: string;
}): string {
  return toSnakeUpperCase([input.prefix, input.scopeId, input.key].filter(Boolean).join('_'));
}

function createRuntimeConfigEnvFragments(input: {
  capabilities: readonly DiscoveredCapability[];
  env: Record<string, string | undefined>;
  privatePrefix?: string;
  publicPrefix?: string;
  schemas: Record<string, object>;
}): RuntimeConfigFragmentMap {
  const fragments: RuntimeConfigFragmentMap = new Map();

  for (const capability of input.capabilities) {
    const schema = input.schemas[capability.id];
    const publicConfig: RuntimeConfigSection = {};
    const privateConfig: RuntimeConfigSection = {};

    for (const key of getRuntimeConfigSchemaSectionKeys(schema, 'public')) {
      const envKey = createRuntimeConfigEnvKey({
        key,
        prefix: input.publicPrefix ?? 'VITE',
        scopeId: capability.id,
      });
      const value = input.env[envKey];

      if (value !== undefined) publicConfig[key] = value;
    }

    for (const key of getRuntimeConfigSchemaSectionKeys(schema, 'private')) {
      const envKey = createRuntimeConfigEnvKey({
        key,
        scopeId: capability.id,
        ...(input.privatePrefix !== undefined ? { prefix: input.privatePrefix } : {}),
      });
      const value = input.env[envKey];

      if (value !== undefined) privateConfig[key] = value;
    }

    if (Object.keys(publicConfig).length || Object.keys(privateConfig).length) {
      fragments.set(capability.id, {
        ...(Object.keys(publicConfig).length ? { public: publicConfig } : {}),
        ...(Object.keys(privateConfig).length ? { private: privateConfig } : {}),
      });
    }
  }

  return fragments;
}

function createRuntimeConfigEnvFragmentOptions(
  capabilities: readonly DiscoveredCapability[],
  schemas: Record<string, object>,
  env: Record<string, string | undefined>,
  options: ReactRuntimeConfigEnvOptions,
): Parameters<typeof createRuntimeConfigEnvFragments>[0] {
  return {
    capabilities,
    env,
    ...(options.privatePrefix !== undefined ? { privatePrefix: options.privatePrefix } : {}),
    ...(options.publicPrefix !== undefined ? { publicPrefix: options.publicPrefix } : {}),
    schemas,
  };
}

function mergeRuntimeConfigSections(
  left: RuntimeConfigSection | undefined,
  right: RuntimeConfigSection | undefined,
): RuntimeConfigSection | undefined {
  const section = {
    ...(left ?? {}),
    ...(right ?? {}),
  };

  return Object.keys(section).length ? section : undefined;
}

function mergeRuntimeConfigFragment(
  left: RuntimeConfigFragment | undefined,
  right: RuntimeConfigFragment | undefined,
): RuntimeConfigFragment {
  const publicConfig = mergeRuntimeConfigSections(left?.public, right?.public);
  const privateConfig = mergeRuntimeConfigSections(left?.private, right?.private);

  return toRuntimeConfigFragment({
    ...(publicConfig ? { public: publicConfig } : {}),
    ...(privateConfig ? { private: privateConfig } : {}),
  });
}

function mergeRuntimeConfigFragmentMaps(
  left: RuntimeConfigFragmentMap,
  right: RuntimeConfigFragmentMap,
): RuntimeConfigFragmentMap {
  const fragments: RuntimeConfigFragmentMap = new Map(left);

  for (const [scopeId, config] of right.entries()) {
    fragments.set(scopeId, mergeRuntimeConfigFragment(fragments.get(scopeId), config));
  }

  return fragments;
}

function getCapabilityRuntimeConfigPolicy(
  capability: DiscoveredCapability,
  validation: ReactRuntimeConfigValidationOptions,
): RuntimeConfigValidationPolicyInput {
  return (
    (capability.manifest.runtimeConfig as RuntimeConfigValidationPolicyInput | undefined) ??
    validation.policy ??
    'optional'
  );
}

function shouldValidateRuntimeConfigFragment(input: {
  capability: DiscoveredCapability;
  fragment: RuntimeConfigFragment | undefined;
  schema: object | undefined;
  validation: ReactRuntimeConfigValidationOptions;
}): boolean {
  if (!input.schema) return false;

  const mode = resolveRuntimeConfigValidationMode(
    getCapabilityRuntimeConfigPolicy(input.capability, input.validation),
  );

  if (mode === 'none' || mode === 'onUse') return false;
  if (mode === 'startup') return true;

  return Boolean(input.fragment);
}

function validateReactRuntimeConfig(
  capabilities: readonly DiscoveredCapability[],
  fragments: RuntimeConfigFragmentMap,
  schemas: RuntimeConfigSchemaEntries,
  validation: false | ReactRuntimeConfigValidationOptions,
): void {
  if (validation === false) return;

  const registry = createRuntimeConfigValidatorRegistry(schemas.schemas, {
    ...(validation.formatError
      ? {
          formatError: (target, validationError) =>
            validation.formatError!(
              {
                configPath: `${target.scopeId} runtime config`,
                schemaPath: schemas.paths.get(target.scopeId) ?? '',
                scopeId: target.scopeId,
              },
              validationError,
            ),
        }
      : {}),
  });

  for (const capability of capabilities) {
    const fragment = fragments.get(capability.id);
    const schema = schemas.schemas[capability.id];

    if (!shouldValidateRuntimeConfigFragment({ capability, fragment, schema, validation })) {
      continue;
    }

    registry.assert(capability.id, fragment ?? {});
  }
}

function resolveRouteDirectory(capabilityDir: string): string | undefined {
  const routesDirectory = resolve(capabilityDir, 'src', 'routes');

  return existsSync(routesDirectory) ? routesDirectory : undefined;
}

function resolveActivationEntry(
  capabilityDir: string,
  packageJson: Record<string, unknown>,
  packageName: string,
  descriptor: Descriptor,
  resolveActivation?: ResolveCapabilityActivation,
): { entryFile?: string; exportName: string; importSpecifier: string } | null {
  // Without a custom activation resolver the default convention stays strict:
  // the package must declare a string "./capability" export that LORION
  // self-resolves to a local file.
  if (!resolveActivation) {
    const packageExports = packageJson.exports;

    if (!isRecord(packageExports) || typeof packageExports['./capability'] !== 'string') {
      throw new Error(`Capability package is missing a "./capability" export: ${capabilityDir}`);
    }

    return {
      entryFile: resolve(capabilityDir, packageExports['./capability']),
      exportName: 'capability',
      importSpecifier: capabilitySpecifier(packageName, './capability'),
    };
  }

  // A custom resolver may target any package export and leaves specifier
  // resolution to the host bundler. A nullish result marks a graph-only
  // capability: resolved for the dependency graph, but not activated.
  const activation = resolveActivation({ capabilityDir, descriptor, packageJson, packageName });
  if (!activation) return null;

  const exportName = activation.exportName ?? 'capability';
  const exportSubpath = activation.exportSubpath ?? './capability';
  return { exportName, importSpecifier: capabilitySpecifier(packageName, exportSubpath) };
}

function hasRouteDirectory(
  capability: DiscoveredCapability,
): capability is DiscoveredCapability & { routesDirectory: string } {
  return typeof capability.routesDirectory === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveWorkspaceRoot(configRoot: string, options: CapabilityLoaderOptions): string {
  if (options.workspaceRoot) return resolve(options.workspaceRoot);

  return findWorkspaceRoot(configRoot);
}

function findWorkspaceRoot(startDir: string): string {
  let current = resolve(startDir);

  while (true) {
    if (
      existsSync(join(current, 'pnpm-workspace.yaml')) &&
      existsSync(join(current, 'capabilities'))
    ) {
      return current;
    }

    const parent = dirname(current);

    if (parent === current) {
      throw new Error(`Could not find React workspace root from: ${startDir}`);
    }

    current = parent;
  }
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
}

function toVariableName(name: string): string {
  return `${name
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .replace(/(?:^|\s)([a-zA-Z0-9])/g, (_, char: string) => char.toUpperCase())
    .replace(/^([A-Z])/, (char) => char.toLowerCase())}Capability`;
}

function toPosixPath(path: string): string {
  return path.split(sep).join('/');
}
