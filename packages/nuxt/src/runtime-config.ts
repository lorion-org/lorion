import {
  getPrivateRuntimeConfigScope,
  getPublicRuntimeConfigScope,
  getRuntimeConfigFragment,
  getRuntimeConfigScope,
  projectSectionedRuntimeConfig,
  resolveRuntimeConfigValueFromRuntimeConfig,
  toRuntimeConfigFragment,
  type GetRuntimeConfigFragmentOptions,
  type GetRuntimeConfigScopeOptions,
  type ResolveRuntimeConfigValueFromRuntimeConfigOptions,
  type NamedRuntimeConfigFragment,
  type RuntimeConfigContext,
  type RuntimeConfigFragmentMap,
  type RuntimeConfigSection,
  type SectionedRuntimeConfig,
} from '@lorion-org/runtime-config';
import type {
  CreateNuxtRuntimeConfigOptions,
  NuxtExtensionSelection,
  NuxtPrivateRuntimeConfigMode,
  NuxtProviderSelectionRuntimeConfig,
  NuxtRuntimeConfig,
  NuxtRuntimeConfigInput,
  ReadNuxtRuntimeConfigOptions,
  RuntimeConfigNuxtFragments,
} from './types';
export type {
  CreateNuxtRuntimeConfigOptions,
  NuxtExtensionSelection,
  NuxtExtensionSelectionRuntimeConfig,
  NuxtPrivateRuntimeConfigMode,
  NuxtRuntimeConfig,
  NuxtRuntimeConfigInput,
  ReadNuxtRuntimeConfigOptions,
  RuntimeConfigNuxtFragments,
} from './types';

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const toStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];

function createContextInputOptions(
  contextInputKey?: string,
): Pick<CreateNuxtRuntimeConfigOptions, 'contextInputKey'> {
  return contextInputKey === undefined ? {} : { contextInputKey };
}

function createPrivateOutputOptions(
  privateOutput?: NuxtPrivateRuntimeConfigMode,
): Pick<CreateNuxtRuntimeConfigOptions, 'privateOutput'> {
  return privateOutput === undefined ? {} : { privateOutput };
}

function createPrivateInputOptions(
  privateInput?: NuxtPrivateRuntimeConfigMode,
): ReadNuxtRuntimeConfigOptions {
  return privateInput === undefined ? {} : { privateInput };
}

function withoutPublicRuntimeConfig(config: NuxtRuntimeConfigInput): RuntimeConfigSection {
  const privateConfig = { ...config };
  delete privateConfig.public;

  return privateConfig;
}

export function normalizeNuxtRuntimeConfigFragments(
  fragments: RuntimeConfigNuxtFragments = {},
  options: Pick<CreateNuxtRuntimeConfigOptions, 'contextInputKey'> = {},
): NamedRuntimeConfigFragment[] | RuntimeConfigFragmentMap {
  if (fragments instanceof Map) {
    const normalizedFragments: RuntimeConfigFragmentMap = new Map();

    for (const [scopeId, config] of fragments.entries()) {
      normalizedFragments.set(scopeId, toRuntimeConfigFragment(config, options));
    }

    return normalizedFragments;
  }

  if (Array.isArray(fragments)) {
    return fragments.map((fragment) => ({
      scopeId: fragment.scopeId,
      config: toRuntimeConfigFragment(fragment.config, options),
    }));
  }

  return Object.entries(fragments).map(([scopeId, config]) => ({
    scopeId,
    config: toRuntimeConfigFragment(config, options),
  }));
}

export function toNuxtRuntimeConfig(
  runtimeConfig: SectionedRuntimeConfig,
  options: Pick<CreateNuxtRuntimeConfigOptions, 'privateOutput'> = {},
): NuxtRuntimeConfig {
  if (options.privateOutput === 'section') {
    return {
      private: {
        ...runtimeConfig.private,
      },
      public: {
        ...runtimeConfig.public,
      },
    };
  }

  return {
    ...runtimeConfig.private,
    public: {
      ...runtimeConfig.public,
    },
  };
}

export function fromNuxtRuntimeConfig(
  runtimeConfig: NuxtRuntimeConfigInput,
  options: ReadNuxtRuntimeConfigOptions = {},
): SectionedRuntimeConfig {
  if (options.privateInput === 'section') {
    return {
      public: isObject(runtimeConfig.public) ? runtimeConfig.public : {},
      private: isObject(runtimeConfig.private) ? runtimeConfig.private : {},
    };
  }

  const { public: publicConfig = {}, ...privateConfig } = runtimeConfig;

  return {
    public: publicConfig,
    private: privateConfig,
  };
}

export function createNuxtRuntimeConfig(
  options: CreateNuxtRuntimeConfigOptions = {},
): NuxtRuntimeConfig {
  const { contextInputKey, fragments, runtimeConfig, ...projectOptions } = options;
  const runtimeConfigFragments = fragments ?? {};
  const sectionedRuntimeConfig =
    runtimeConfig ??
    projectSectionedRuntimeConfig(
      normalizeNuxtRuntimeConfigFragments(
        runtimeConfigFragments,
        createContextInputOptions(contextInputKey),
      ),
      projectOptions,
    );

  return toNuxtRuntimeConfig(
    sectionedRuntimeConfig,
    createPrivateOutputOptions(options.privateOutput),
  );
}

export function mergeNuxtRuntimeConfig(
  target: NuxtRuntimeConfigInput = {},
  source: NuxtRuntimeConfigInput = {},
): NuxtRuntimeConfig {
  const targetPublic = isObject(target.public) ? target.public : {};
  const sourcePublic = isObject(source.public) ? source.public : {};

  return {
    ...withoutPublicRuntimeConfig(target),
    ...withoutPublicRuntimeConfig(source),
    public: {
      ...targetPublic,
      ...sourcePublic,
    },
  };
}

export function getNuxtExtensionSelection(
  runtimeConfig: NuxtRuntimeConfigInput,
): NuxtExtensionSelection {
  const selection = isObject(runtimeConfig.public?.extensionSelection)
    ? runtimeConfig.public.extensionSelection
    : undefined;

  if (!selection) {
    return {
      discoveredExtensionIds: [],
      notInjectedExtensionIds: [],
      resolvedExtensionIds: [],
      selectedExtensionIds: [],
    };
  }

  const discoveredExtensionIds = toStringArray(selection.discoveredExtensionIds);
  const resolvedExtensionIds = toStringArray(selection.resolvedExtensionIds);
  const resolvedExtensionIdSet = new Set(resolvedExtensionIds);

  return {
    discoveredExtensionIds,
    notInjectedExtensionIds: discoveredExtensionIds
      .filter((id) => !resolvedExtensionIdSet.has(id))
      .sort((left, right) => left.localeCompare(right)),
    resolvedExtensionIds,
    selectedExtensionIds: toStringArray(selection.selectedExtensionIds),
  };
}

export function getNuxtProviderSelection(
  runtimeConfig: NuxtRuntimeConfigInput,
): NuxtProviderSelectionRuntimeConfig | undefined {
  const providerSelection = runtimeConfig.public?.providerSelection;

  return isObject(providerSelection) && isObject(providerSelection.selections)
    ? (providerSelection as NuxtProviderSelectionRuntimeConfig)
    : undefined;
}

export function getPublicNuxtRuntimeConfigScope<
  T extends RuntimeConfigSection = RuntimeConfigSection,
>(
  runtimeConfig: NuxtRuntimeConfigInput,
  scopeId: string,
  options: Omit<GetRuntimeConfigScopeOptions, 'visibility'> & ReadNuxtRuntimeConfigOptions = {},
): T {
  const { privateInput, ...scopeOptions } = options;

  return getPublicRuntimeConfigScope<T>(
    fromNuxtRuntimeConfig(runtimeConfig, createPrivateInputOptions(privateInput)),
    scopeId,
    scopeOptions,
  );
}

export function getNuxtRuntimeConfigScope<T extends RuntimeConfigSection = RuntimeConfigSection>(
  runtimeConfig: NuxtRuntimeConfigInput,
  scopeId: string,
  options: GetRuntimeConfigScopeOptions & ReadNuxtRuntimeConfigOptions = {},
): T {
  const { privateInput, ...scopeOptions } = options;

  return getRuntimeConfigScope<T>(
    fromNuxtRuntimeConfig(runtimeConfig, createPrivateInputOptions(privateInput)),
    scopeId,
    scopeOptions,
  );
}

export function getPrivateNuxtRuntimeConfigScope<
  T extends RuntimeConfigSection = RuntimeConfigSection,
>(
  runtimeConfig: NuxtRuntimeConfigInput,
  scopeId: string,
  options: Omit<GetRuntimeConfigScopeOptions, 'visibility'> & ReadNuxtRuntimeConfigOptions = {},
): T {
  const { privateInput, ...scopeOptions } = options;

  return getPrivateRuntimeConfigScope<T>(
    fromNuxtRuntimeConfig(runtimeConfig, createPrivateInputOptions(privateInput)),
    scopeId,
    scopeOptions,
  );
}

export function resolveNuxtRuntimeConfigValue<T = unknown>(
  runtimeConfig: NuxtRuntimeConfigInput,
  scopeId: string,
  key: string,
  options: ResolveRuntimeConfigValueFromRuntimeConfigOptions<T> & ReadNuxtRuntimeConfigOptions = {},
): T | undefined {
  const { privateInput, ...resolveOptions } = options;

  return resolveRuntimeConfigValueFromRuntimeConfig<T>(
    fromNuxtRuntimeConfig(runtimeConfig, createPrivateInputOptions(privateInput)),
    scopeId,
    key,
    resolveOptions,
  );
}

export function getNuxtRuntimeConfigFragment(
  runtimeConfig: NuxtRuntimeConfigInput,
  scopeId: string,
  options: GetRuntimeConfigFragmentOptions & ReadNuxtRuntimeConfigOptions = {},
): RuntimeConfigContext {
  const { privateInput, ...fragmentOptions } = options;

  return getRuntimeConfigFragment(
    fromNuxtRuntimeConfig(runtimeConfig, createPrivateInputOptions(privateInput)),
    scopeId,
    fragmentOptions,
  );
}
