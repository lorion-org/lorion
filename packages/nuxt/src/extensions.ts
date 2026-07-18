import { existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import {
  createDescriptorCatalog,
  parseDescriptorIds,
  resolveDescriptorSelectionSeed,
  type DescriptorCatalog,
  type Descriptor,
  type RelationDescriptor,
} from '@lorion-org/composition-graph';
import { discoverDescriptors } from '@lorion-org/descriptor-discovery';
import {
  collectProviderDefaults,
  collectProviderPreferences,
  collectSelectedProviderPreferences,
  resolveItemProviderSelection,
  type ProviderPreferenceMap,
} from '@lorion-org/provider-selection';
import {
  applyProviderSelection,
  assertSingleDefaultProvider,
  descriptorSelectionPolicy,
  providerRelationDescriptors,
} from '@lorion-org/descriptor-selection';
import type { RuntimeConfigValidationPolicy } from '@lorion-org/runtime-config';
import type {
  NuxtBaseExtensionSelectionInput,
  NuxtExtensionSelectionRuntimeConfig,
  NuxtExtensionModuleOptions,
  NuxtExtensionSelectionSeedOptions,
  NuxtProviderSelectionModuleOptions,
  NuxtProviderSelectionRuntimeConfig,
  NuxtRuntimeConfig,
} from './types';
import { nuxtExtensionDescriptorSchema } from './descriptor-schema';

export type {
  LorionNuxtModuleOptions,
  NuxtExtensionModuleOptions,
  NuxtExtensionSelectionSeedOptions,
  RuntimeConfigNuxtModuleOptions,
} from './types';

export type NuxtExtensionDescriptor = Descriptor & {
  defaultFor?: string | string[];
  providerPreferences?: ProviderPreferenceMap;
  publicRuntimeConfig?: NuxtRuntimeConfig['public'];
  runtimeConfig?: RuntimeConfigValidationPolicy;
};

export type NuxtExtensionEntry = {
  appDir?: string;
  configFile?: string;
  cwd: string;
  descriptor: NuxtExtensionDescriptor;
  modulesDir?: string;
  publicDir?: string;
  serverDir?: string;
  sharedDir?: string;
};

export type NuxtExtensionBootstrap = {
  activeExtensions: NuxtExtensionEntry[];
  baseExtensionIds: string[];
  catalog: DescriptorCatalog;
  discoveredExtensions: NuxtExtensionEntry[];
  publicRuntimeConfig: NuxtRuntimeConfig;
  resolvedExtensionIds: string[];
  resolvedExtensions: NuxtExtensionEntry[];
  selectedExtensions: string[];
};

type NuxtProviderSelectionOptions = Omit<NuxtProviderSelectionModuleOptions, 'enabled'>;

type ResolvedNuxtExtensionOptions = {
  descriptorSchema: false | object;
  descriptorPaths: string[];
};

const defaultExtensionOptions = {
  defaultSelection: 'default',
  publicRuntimeConfigKey: 'extensionSelection',
  descriptorPaths: ['extensions/*/extension.json'],
} as const;
const defaultExtensionSelectionSeedKey = 'capability';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeSelection(value: string | string[] | undefined): string[] {
  return parseDescriptorIds(value);
}

function resolveNuxtExtensionSelectionSeed(
  seedOptions: false | NuxtExtensionSelectionSeedOptions | undefined,
): string[] {
  if (seedOptions === false) return [];

  return resolveDescriptorSelectionSeed({
    argv: seedOptions?.argv ?? process.argv,
    env: seedOptions?.env ?? process.env,
    key: seedOptions?.key ?? defaultExtensionSelectionSeedKey,
    ...(seedOptions?.cliKeys ? { cliKeys: seedOptions.cliKeys } : {}),
    ...(seedOptions?.envKeys ? { envKeys: seedOptions.envKeys } : {}),
  });
}

function resolveExtensionOptions(
  options: NuxtExtensionModuleOptions,
): ResolvedNuxtExtensionOptions {
  return {
    descriptorSchema: options.descriptorSchema ?? nuxtExtensionDescriptorSchema,
    descriptorPaths: options.descriptorPaths ?? [...defaultExtensionOptions.descriptorPaths],
  };
}

export function resolveExtensionSelection(
  input: {
    defaultSelection?: string | string[];
    selected?: string | string[];
  } = {},
): string[] {
  const candidates = [
    normalizeSelection(input.selected),
    normalizeSelection(input.defaultSelection ?? defaultExtensionOptions.defaultSelection),
  ];

  return candidates.find((candidate) => candidate.length > 0) ?? [];
}

function resolveBaseExtensionSelection(
  input: NuxtBaseExtensionSelectionInput & {
    options: NuxtExtensionModuleOptions;
  },
): string[] {
  const baseExtensions = input.options.baseExtensions;

  return typeof baseExtensions === 'function'
    ? normalizeSelection(baseExtensions(input))
    : normalizeSelection(baseExtensions);
}

function optionalDir(path: string): string | undefined {
  return existsSync(path) ? path : undefined;
}

function optionalFile(path: string): string | undefined {
  return existsSync(path) ? path : undefined;
}

function findNuxtConfigFile(cwd: string): string | undefined {
  return ['nuxt.config.ts', 'nuxt.config.mts', 'nuxt.config.js', 'nuxt.config.mjs']
    .map((fileName) => optionalFile(join(cwd, fileName)))
    .find(Boolean);
}

function createExtensionEntry(input: {
  cwd: string;
  descriptor: NuxtExtensionDescriptor;
}): NuxtExtensionEntry {
  const descriptor: NuxtExtensionDescriptor = {
    ...input.descriptor,
    location: input.descriptor.location ?? input.cwd,
  };
  const appDir = optionalDir(join(input.cwd, 'app'));
  const modulesDir = optionalDir(join(input.cwd, 'modules'));
  const publicDir = optionalDir(join(input.cwd, 'public'));
  const serverDir = optionalDir(join(input.cwd, 'server'));
  const sharedDir = optionalDir(join(input.cwd, 'shared'));
  const configFile = findNuxtConfigFile(input.cwd);
  const entry: NuxtExtensionEntry = {
    cwd: input.cwd,
    descriptor,
  };

  if (appDir) entry.appDir = appDir;
  if (configFile) entry.configFile = configFile;
  if (modulesDir) entry.modulesDir = modulesDir;
  if (publicDir) entry.publicDir = publicDir;
  if (serverDir) entry.serverDir = serverDir;
  if (sharedDir) entry.sharedDir = sharedDir;

  return entry;
}

function canRegisterExtensionLayer(entry: NuxtExtensionEntry): boolean {
  return Boolean(
    entry.appDir ||
    entry.configFile ||
    entry.modulesDir ||
    entry.publicDir ||
    entry.serverDir ||
    entry.sharedDir,
  );
}

function canExtendExtensionLayer(entry: NuxtExtensionEntry): boolean {
  return Boolean(entry.configFile);
}

export function discoverNuxtExtensionEntries(input: {
  projectRootDir: string;
  options: NuxtExtensionModuleOptions;
}): NuxtExtensionEntry[] {
  const resolvedOptions = resolveExtensionOptions(input.options);

  return discoverDescriptors({
    cwd: input.projectRootDir,
    descriptorPaths: resolvedOptions.descriptorPaths,
    nestedField: 'bundles',
    ...(resolvedOptions.descriptorSchema === false
      ? {}
      : {
          validation: {
            schema: resolvedOptions.descriptorSchema,
          },
        }),
  }).map((entry) =>
    createExtensionEntry({
      cwd: entry.cwd,
      descriptor: entry.descriptor,
    }),
  );
}

export function createNuxtExtensionCatalog(input: {
  entries: NuxtExtensionEntry[];
  relationDescriptors?: RelationDescriptor[];
}): DescriptorCatalog {
  return createDescriptorCatalog({
    descriptors: input.entries.map((entry) => entry.descriptor),
    relationDescriptors: [...providerRelationDescriptors, ...(input.relationDescriptors ?? [])],
  });
}

export function createNuxtExtensionEntryMap(
  entries: NuxtExtensionEntry[],
): Map<string, NuxtExtensionEntry> {
  return new Map(entries.map((entry) => [entry.descriptor.id, entry]));
}

function pickEntriesById(
  ids: string[],
  entryById: Map<string, NuxtExtensionEntry>,
): NuxtExtensionEntry[] {
  return ids
    .map((id) => entryById.get(id))
    .filter((entry): entry is NuxtExtensionEntry => Boolean(entry));
}

// The capability -> selected-provider map, used by the module to expose provider
// selection through runtime config. The selection cleaning itself is delegated to
// @lorion-org/descriptor-selection's `applyProviderSelection`.
export function createNuxtSelectedProviderPreferences(input: {
  entries: NuxtExtensionEntry[];
  selectedExtensions: string[];
}): ProviderPreferenceMap {
  return collectSelectedProviderPreferences({
    items: input.entries,
    getCapabilityId: (entry) => entry.descriptor.providesFor,
    getProviderId: (entry) => entry.descriptor.id,
    selectedProviderIds: input.selectedExtensions,
  });
}

function mergeRuntimeConfigSection(
  target: NuxtRuntimeConfig['public'] = {},
  source: NuxtRuntimeConfig['public'] = {},
): NuxtRuntimeConfig['public'] {
  const merged: NuxtRuntimeConfig['public'] = { ...target };

  for (const [key, value] of Object.entries(source)) {
    const current = merged[key];

    merged[key] =
      isRecord(current) && isRecord(value) ? mergeRuntimeConfigSection(current, value) : value;
  }

  return merged;
}

function createExtensionSelectionRuntimeConfig(input: {
  activeExtensions: NuxtExtensionEntry[];
  baseExtensionIds: string[];
  discoveredExtensions: NuxtExtensionEntry[];
  publicRuntimeConfigKey: false | string;
  resolvedExtensionIds: string[];
  selectedExtensions: string[];
}): NuxtRuntimeConfig {
  const runtimeConfig = input.activeExtensions.reduce<NuxtRuntimeConfig>(
    (current, extension) => ({
      ...current,
      public: mergeRuntimeConfigSection(
        current.public,
        extension.descriptor.publicRuntimeConfig ?? {},
      ),
    }),
    { public: {} },
  );

  if (input.publicRuntimeConfigKey === false) return runtimeConfig;

  return {
    ...runtimeConfig,
    public: {
      ...runtimeConfig.public,
      [defaultExtensionOptions.publicRuntimeConfigKey]: {
        discoveredExtensionIds: input.discoveredExtensions
          .map((extension) => extension.descriptor.id)
          .sort((left, right) => left.localeCompare(right)),
        resolvedExtensionIds: input.resolvedExtensionIds,
        selectedExtensionIds: input.selectedExtensions,
      } satisfies NuxtExtensionSelectionRuntimeConfig,
    },
  };
}

export function createNuxtExtensionBootstrap(input: {
  options?: NuxtExtensionModuleOptions;
  rootDir: string;
}): NuxtExtensionBootstrap {
  const options = input.options ?? {};
  const selectedExtensions = resolveExtensionSelection({
    ...(options.defaultSelection ? { defaultSelection: options.defaultSelection } : {}),
    selected: options.selected ?? resolveNuxtExtensionSelectionSeed(options.selectionSeed),
  });
  const createCatalog = (entries: NuxtExtensionEntry[]): DescriptorCatalog =>
    createNuxtExtensionCatalog({
      entries,
      ...(options.relationDescriptors ? { relationDescriptors: options.relationDescriptors } : {}),
    });

  if (options.enabled === false) {
    return {
      activeExtensions: [],
      baseExtensionIds: [],
      catalog: createCatalog([]),
      discoveredExtensions: [],
      publicRuntimeConfig: { public: {} },
      resolvedExtensionIds: [],
      resolvedExtensions: [],
      selectedExtensions,
    };
  }

  const entries = discoverNuxtExtensionEntries({
    projectRootDir: input.rootDir,
    options,
  });
  const baseExtensionIds = resolveBaseExtensionSelection({
    descriptors: entries.map((entry) => entry.descriptor),
    options,
    selectedExtensions,
  });

  if (!entries.length) {
    return {
      activeExtensions: [],
      baseExtensionIds,
      catalog: createCatalog(entries),
      discoveredExtensions: entries,
      publicRuntimeConfig: { public: {} },
      resolvedExtensionIds: [],
      resolvedExtensions: [],
      selectedExtensions,
    };
  }

  assertSingleDefaultProvider(entries.map((entry) => entry.descriptor));

  const resolutionEntries = applyProviderSelection({
    items: entries,
    selected: selectedExtensions,
    getDescriptor: (entry) => entry.descriptor,
    withDescriptor: (entry, descriptor) => ({ ...entry, descriptor }),
  });
  const catalog = createCatalog(resolutionEntries);
  const selection = catalog.resolveSelection({
    baseDescriptors: baseExtensionIds,
    policy: descriptorSelectionPolicy(),
    selected: selectedExtensions,
  });
  const resolvedExtensionIds = selection.getResolved();
  const resolvedExtensions = pickEntriesById(
    resolvedExtensionIds,
    createNuxtExtensionEntryMap(resolutionEntries),
  );
  const activeExtensions = resolvedExtensions.filter(canRegisterExtensionLayer);

  return {
    activeExtensions,
    baseExtensionIds: selection.getBaseDescriptors(),
    catalog,
    discoveredExtensions: entries,
    publicRuntimeConfig: createExtensionSelectionRuntimeConfig({
      activeExtensions,
      baseExtensionIds: selection.getBaseDescriptors(),
      discoveredExtensions: entries,
      publicRuntimeConfigKey: defaultExtensionOptions.publicRuntimeConfigKey,
      resolvedExtensionIds,
      selectedExtensions,
    }),
    resolvedExtensionIds,
    resolvedExtensions,
    selectedExtensions: selection.getSelected(),
  };
}

export function createNuxtExtensionLayerPaths(bootstrap: NuxtExtensionBootstrap): string[] {
  return bootstrap.activeExtensions
    .filter(canExtendExtensionLayer)
    .map((extension) => extension.cwd);
}

export function createNuxtProviderSelectionRuntimeConfig(
  extensions: NuxtExtensionEntry[],
  options: NuxtProviderSelectionOptions = {},
): NuxtRuntimeConfig {
  const publicRuntimeConfigKey = 'providerSelection';
  const descriptorPreferences = collectProviderPreferences({
    items: extensions,
    getProviderPreferences: (extension) => extension.descriptor.providerPreferences,
  });
  const providerDefaults = collectProviderDefaults({
    items: extensions,
    getDefaultFor: (extension) => extension.descriptor.defaultFor,
    getProviderId: (extension) => extension.descriptor.id,
  });
  const configuredProviders = options.configuredProviders ?? {};
  const selectedProviders = options.selectedProviders ?? {};
  const fallbackProviders = {
    ...providerDefaults,
    ...descriptorPreferences,
    ...(options.fallbackProviders ?? {}),
  };
  const resolution = resolveItemProviderSelection({
    items: extensions,
    getCapabilityId: (extension) => extension.descriptor.providesFor,
    getProviderId: (extension) => extension.descriptor.id,
    configuredProviders,
    fallbackProviders,
    selectedProviders,
  });

  return {
    public: {
      [publicRuntimeConfigKey]: {
        configuredProviders,
        excludedProviderIds: resolution.excludedProviderIds,
        fallbackProviders,
        mismatches: resolution.mismatches,
        selections: Object.fromEntries(resolution.selections),
      } satisfies NuxtProviderSelectionRuntimeConfig,
    },
  };
}
