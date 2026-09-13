import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  createDescriptorCatalog,
  type DescriptorCatalog,
  type RelationDescriptor,
} from '@lorion-org/composition-graph';
import {
  discoverDescriptors,
  loadBundleManifest,
  NESTED_DESCRIPTOR_FIELD,
  virtualDescriptorDirectory,
  type SchemaDescriptor,
} from '@lorion-org/descriptor-discovery';

import { descriptorSchema } from './descriptor-schema';
import type { ProviderSelectionResolution } from '@lorion-org/provider-selection';
import {
  providerRelationDescriptors,
  resolveDescriptorSelection,
  resolveDescriptorSeed,
  selectDescriptorsWithProviders,
  type DescriptorSelectionSeed,
  type DescriptorVersionSelection,
} from '@lorion-org/descriptor-selection';
import type {
  NuxtExtensionSelectionRuntimeConfig,
  NuxtExtensionModuleOptions,
  NuxtProviderSelectionRuntimeConfig,
  NuxtRuntimeConfig,
} from './types';

export type {
  LorionNuxtModuleOptions,
  NuxtExtensionModuleOptions,
  RuntimeConfigNuxtModuleOptions,
  NuxtExtensionSelectionSeedOptions,
} from './types';

// A Nuxt extension descriptor is the shared descriptor. Every field this adapter
// reads is a core field declared by `descriptor.schema.json`, so there is nothing
// left for this name to add beyond saying so in Nuxt's vocabulary.
export type NuxtExtensionDescriptor = SchemaDescriptor;

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
  versionSelection?: readonly DescriptorVersionSelection[];
  activeExtensions: NuxtExtensionEntry[];
  baseExtensionIds: string[];
  catalog: DescriptorCatalog;
  discoveredExtensions: NuxtExtensionEntry[];
  publicRuntimeConfig: NuxtRuntimeConfig;
  // The specifications this run asked for through `selected` or the seed, or null when it
  // named none and took `defaultSelection`. Kept apart from `selectedExtensions`,
  // which is the outcome, so a report can say which of the two a reader is seeing.
  requestedExtensions: string[] | null;
  providerSelection: ProviderSelectionResolution;
  resolvedExtensionIds: string[];
  resolvedExtensions: NuxtExtensionEntry[];
  selectedExtensions: string[];
};

type ResolvedNuxtExtensionOptions = {
  descriptorSchema: false | object;
  descriptorPaths: string[];
  nestedField: false | string;
};

const defaultExtensionOptions = {
  defaultSelection: ['default'] as readonly string[],
  publicRuntimeConfigKey: 'extensionSelection',
  descriptorPaths: ['extensions/*/extension.json'],
} as const;
const defaultExtensionSelectionSeedKey = 'capability';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function resolveExtensionOptions(
  options: NuxtExtensionModuleOptions,
): ResolvedNuxtExtensionOptions {
  return {
    descriptorSchema: options.descriptorSchema ?? descriptorSchema,
    nestedField: options.nestedField ?? NESTED_DESCRIPTOR_FIELD,
    descriptorPaths: [
      ...(options.descriptorPaths ??
        (options.capabilitiesDir
          ? [`${options.capabilitiesDir}/*/extension.json`]
          : defaultExtensionOptions.descriptorPaths)),
    ],
  };
}

export function resolveExtensionSelection(
  input: {
    defaultSelection?: readonly string[];
    selected?: readonly string[];
  } = {},
): string[] {
  // Resolved through the shared seed resolver, which rejects a string where a list
  // is meant rather than spreading it into one-character ids.
  return resolveDescriptorSelection({
    ...(input.selected ? { selected: input.selected } : {}),
    defaultSelection: input.defaultSelection ?? defaultExtensionOptions.defaultSelection,
    selectionSeed: false,
  });
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
    ...(resolvedOptions.nestedField === false ? {} : { nestedField: resolvedOptions.nestedField }),
    ...(resolvedOptions.descriptorSchema === false
      ? {}
      : {
          validation: {
            schema: resolvedOptions.descriptorSchema,
          },
        }),
  })
    .map((entry) =>
      createExtensionEntry({
        // A nested descriptor owns no directory of its own: it shares its host's.
        // Addressing it at a synthetic path keeps it out of layer registration, so
        // a grouping never contributes its host's app, config or server dirs.
        cwd: entry.nested
          ? virtualDescriptorDirectory(input.projectRootDir, entry.descriptor.id)
          : entry.cwd,
        descriptor: entry.descriptor,
      }),
    )
    .concat(
      // Host-provided groupings: descriptors passed in directly and those a bundle
      // manifest declares. They take part in selection and register nothing.
      [
        ...(input.options.virtualDescriptors ?? []),
        ...(input.options.bundles ? loadBundleManifest(input.options.bundles) : []),
      ].map((descriptor) =>
        createExtensionEntry({
          cwd: virtualDescriptorDirectory(input.projectRootDir, descriptor.id),
          descriptor,
        }),
      ),
    );
}

export function createNuxtExtensionCatalog(input: {
  entries: NuxtExtensionEntry[];
  relationDescriptors?: readonly RelationDescriptor[];
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
  resolvedExtensions: NuxtExtensionEntry[];
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
        discoveredExtensionIds: [
          ...new Set(input.discoveredExtensions.map((extension) => extension.descriptor.id)),
        ].sort(),
        resolvedExtensionIds: input.resolvedExtensionIds,
        resolvedExtensionVersions: Object.fromEntries(
          input.resolvedExtensions.map((entry) => [entry.descriptor.id, entry.descriptor.version]),
        ),
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
  const seedInput: DescriptorSelectionSeed = {
    defaultSelection: options.defaultSelection ?? defaultExtensionOptions.defaultSelection,
    ...(options.selected ? { selected: options.selected } : {}),
    baseDescriptors: options.baseDescriptors ?? [],
    selectionSeed:
      options.selectionSeed === false
        ? false
        : {
            ...options.selectionSeed,
            key: options.selectionSeed?.key ?? defaultExtensionSelectionSeedKey,
          },
  };
  const createCatalog = (entries: NuxtExtensionEntry[]): DescriptorCatalog =>
    createNuxtExtensionCatalog({
      entries,
      ...(options.relationDescriptors ? { relationDescriptors: options.relationDescriptors } : {}),
    });
  const emptyProviderSelection = (): ProviderSelectionResolution => ({
    excludedProviderIds: [],
    slots: [],
  });

  const entries =
    options.enabled === false
      ? []
      : discoverNuxtExtensionEntries({
          projectRootDir: input.rootDir,
          options,
        });
  if (!entries.length) {
    const seed = resolveDescriptorSeed(seedInput);
    return {
      versionSelection: [],
      activeExtensions: [],
      baseExtensionIds: options.enabled === false ? [] : [...seed.baseDescriptors],
      catalog: createCatalog(entries),
      discoveredExtensions: entries,
      publicRuntimeConfig: { public: {} },
      providerSelection: emptyProviderSelection(),
      requestedExtensions: seed.requested ? [...seed.requested] : null,
      resolvedExtensionIds: [],
      resolvedExtensions: [],
      selectedExtensions: [...seed.selected],
    };
  }

  // One selection brain. Rebuilding this pipeline here is how the disabled filter
  // and the single-selected-provider guard came to apply on one host and not the
  // other for the very same descriptors.
  const {
    items: resolvedExtensions,
    seed,
    versions,
    catalog,
    providerSelection,
  } = selectDescriptorsWithProviders({
    items: entries,
    getDescriptor: (entry) => entry.descriptor,
    getSource: (entry) => entry.cwd,
    withDescriptor: (entry, descriptor) => ({ ...entry, descriptor }),
    getSelectionGroupMembers: (entry) =>
      entry.cwd === virtualDescriptorDirectory(input.rootDir, entry.descriptor.id)
        ? Object.keys(entry.descriptor.dependencies ?? {})
        : undefined,
    seed: seedInput,
    ...(options.relationDescriptors
      ? { relationDescriptors: [...options.relationDescriptors] }
      : {}),
    ...(options.policy ? { policy: options.policy } : {}),
  });
  const selectedExtensions = [...seed.selected];
  const baseExtensionIds = [...seed.baseDescriptors];
  const requestedExtensions = seed.requested ? [...seed.requested] : null;
  const resolvedExtensionIds = resolvedExtensions.map((entry) => entry.descriptor.id);
  const activeExtensions = resolvedExtensions.filter(canRegisterExtensionLayer);

  return {
    versionSelection: versions,
    activeExtensions,
    baseExtensionIds,
    catalog,
    discoveredExtensions: entries,
    publicRuntimeConfig: createExtensionSelectionRuntimeConfig({
      activeExtensions,
      baseExtensionIds,
      discoveredExtensions: entries,
      publicRuntimeConfigKey: defaultExtensionOptions.publicRuntimeConfigKey,
      resolvedExtensionIds,
      resolvedExtensions,
      selectedExtensions,
    }),
    providerSelection,
    requestedExtensions,
    resolvedExtensionIds,
    resolvedExtensions,
    selectedExtensions,
  };
}

export function createNuxtExtensionLayerPaths(bootstrap: NuxtExtensionBootstrap): string[] {
  return bootstrap.activeExtensions
    .filter(canExtendExtensionLayer)
    .map((extension) => extension.cwd);
}

export function createNuxtProviderSelectionRuntimeConfig(
  resolution: ProviderSelectionResolution,
): NuxtRuntimeConfig {
  const publicRuntimeConfigKey = 'providerSelection';

  return {
    public: {
      [publicRuntimeConfigKey]: {
        excludedProviderIds: resolution.excludedProviderIds,
        slots: resolution.slots,
      } satisfies NuxtProviderSelectionRuntimeConfig,
    },
  };
}
