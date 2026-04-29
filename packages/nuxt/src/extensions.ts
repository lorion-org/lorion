import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  createDescriptorCatalog,
  type DescriptorCatalog,
  type Descriptor,
} from '@lorion-org/composition-graph';
import { discoverDescriptors } from '@lorion-org/descriptor-discovery';
import {
  resolveItemProviderSelection,
  type ProviderPreferenceMap,
} from '@lorion-org/provider-selection';
import type {
  NuxtBaseExtensionSelectionInput,
  NuxtExtensionSelectionRuntimeConfig,
  NuxtExtensionModuleOptions,
  NuxtProviderSelectionModuleOptions,
  NuxtProviderSelectionRuntimeConfig,
  NuxtRuntimeConfig,
} from './types';
import { nuxtExtensionDescriptorSchema } from './descriptor-schema';

export type { NuxtExtensionModuleOptions } from './types';

export type NuxtExtensionDescriptor = Descriptor & {
  providerPreferences?: ProviderPreferenceMap;
  publicRuntimeConfig?: NuxtRuntimeConfig['public'];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];

  return Array.isArray(value) ? value : [value];
}

function splitSelectionValue(value: string): string[] {
  return value
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeSelection(value: string | string[] | undefined): string[] {
  return asArray(value).flatMap((entry) => {
    if (typeof entry !== 'string') return [];

    return splitSelectionValue(entry);
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
  const appDir = optionalDir(join(input.cwd, 'app'));
  const modulesDir = optionalDir(join(input.cwd, 'modules'));
  const publicDir = optionalDir(join(input.cwd, 'public'));
  const serverDir = optionalDir(join(input.cwd, 'server'));
  const sharedDir = optionalDir(join(input.cwd, 'shared'));
  const configFile = findNuxtConfigFile(input.cwd);
  const entry: NuxtExtensionEntry = {
    cwd: input.cwd,
    descriptor: input.descriptor,
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

function discoverExtensionEntries(input: {
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

function pickEntriesById(
  ids: string[],
  entryById: Map<string, NuxtExtensionEntry>,
): NuxtExtensionEntry[] {
  return ids
    .map((id) => entryById.get(id))
    .filter((entry): entry is NuxtExtensionEntry => Boolean(entry));
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
    ...(options.selected ? { selected: options.selected } : {}),
  });
  const createCatalog = (entries: NuxtExtensionEntry[]): DescriptorCatalog =>
    createDescriptorCatalog({
      descriptors: entries.map((entry) => entry.descriptor),
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

  const entries = discoverExtensionEntries({
    projectRootDir: input.rootDir,
    options,
  });
  const baseExtensionIds = resolveBaseExtensionSelection({
    descriptors: entries.map((entry) => entry.descriptor),
    options,
    selectedExtensions,
  });
  const entryById = new Map(entries.map((entry) => [entry.descriptor.id, entry]));

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

  const catalog = createCatalog(entries);
  const selection = catalog.resolveSelection({
    baseDescriptors: baseExtensionIds,
    selected: selectedExtensions,
  });
  const resolvedExtensionIds = selection.getResolved();
  const resolvedExtensions = pickEntriesById(resolvedExtensionIds, entryById);
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

function collectProviderPreferences(extensions: NuxtExtensionEntry[]): ProviderPreferenceMap {
  return extensions.reduce<ProviderPreferenceMap>((preferences, extension) => {
    const value = extension.descriptor.providerPreferences;

    if (!isRecord(value)) return preferences;

    return {
      ...preferences,
      ...Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
        ),
      ),
    };
  }, {});
}

export function createNuxtProviderSelectionRuntimeConfig(
  extensions: NuxtExtensionEntry[],
  options: NuxtProviderSelectionOptions = {},
): NuxtRuntimeConfig {
  const publicRuntimeConfigKey = 'providerSelection';
  const descriptorPreferences = collectProviderPreferences(extensions);
  const configuredProviders = {
    ...descriptorPreferences,
    ...(options.configuredProviders ?? {}),
  };
  const resolution = resolveItemProviderSelection({
    items: extensions,
    getCapabilityId: (extension) => extension.descriptor.providesFor,
    getProviderId: (extension) => extension.descriptor.id,
    configuredProviders,
  });

  return {
    public: {
      [publicRuntimeConfigKey]: {
        configuredProviders,
        excludedProviderIds: resolution.excludedProviderIds,
        mismatches: resolution.mismatches,
        selections: Object.fromEntries(resolution.selections),
      } satisfies NuxtProviderSelectionRuntimeConfig,
    },
  };
}
