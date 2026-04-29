import { createRuntimeConfigKey, type RuntimeConfigKeyOptions } from './key';
import { toRuntimeConfigFragment, type NormalizeRuntimeConfigFragmentOptions } from './fragment';
import {
  runtimeConfigVisibilities,
  type NamedRuntimeConfigFragment,
  type RuntimeConfigContext,
  type RuntimeConfigFragment,
  type RuntimeConfigFragmentMap,
  type RuntimeConfigNamespaceProjection,
  type RuntimeConfigSection,
  type SectionedRuntimeConfig,
  type ConfigVisibility,
} from './types';

export type ProjectSectionedRuntimeConfigOptions = RuntimeConfigKeyOptions &
  NormalizeRuntimeConfigFragmentOptions & {
    contextOutputKey?: string;
    includeContexts?: boolean;
    scopeIds?: string[];
  };

export type ProjectRuntimeConfigFragmentOptions = Omit<
  ProjectSectionedRuntimeConfigOptions,
  'scopeIds'
>;

export type ProjectRuntimeConfigNamespacesOptions = {
  contextInputKey?: string;
  contextId?: string;
  namespaceStrategy?: 'nested' | 'flat';
  scopeIds?: string[];
};

export type ProjectRuntimeConfigNamespaceOptions = Omit<
  ProjectRuntimeConfigNamespacesOptions,
  'scopeIds'
>;

export function normalizeRuntimeConfigFragments(
  fragments: Iterable<NamedRuntimeConfigFragment> | RuntimeConfigFragmentMap,
  options: NormalizeRuntimeConfigFragmentOptions = {},
): NamedRuntimeConfigFragment[] {
  const entries =
    fragments instanceof Map
      ? Array.from(fragments.entries()).map(([scopeId, config]) => ({ scopeId, config }))
      : Array.from(fragments);

  return entries
    .map((fragment) => ({
      scopeId: fragment.scopeId.trim(),
      config: toRuntimeConfigFragment(fragment.config, options),
    }))
    .filter((fragment) => fragment.scopeId.length > 0)
    .sort((left, right) => left.scopeId.localeCompare(right.scopeId));
}

function filterFragments(input: {
  fragments: Iterable<NamedRuntimeConfigFragment> | RuntimeConfigFragmentMap;
  contextInputKey?: string;
  scopeIds?: string[];
}): NamedRuntimeConfigFragment[] {
  const scopeIdSet = input.scopeIds
    ? new Set(input.scopeIds.map((id) => id.trim()).filter(Boolean))
    : undefined;

  return normalizeRuntimeConfigFragments(input.fragments, {
    ...(input.contextInputKey ? { contextInputKey: input.contextInputKey } : {}),
  }).filter((fragment) => !scopeIdSet || scopeIdSet.has(fragment.scopeId));
}

function getSection(
  config: RuntimeConfigContext | undefined,
  visibility: ConfigVisibility,
): RuntimeConfigSection | undefined {
  return config?.[visibility];
}

function assignDefined(target: RuntimeConfigSection, key: string, value: unknown): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

export function projectSectionedRuntimeConfig(
  fragments: Iterable<NamedRuntimeConfigFragment> | RuntimeConfigFragmentMap,
  options: ProjectSectionedRuntimeConfigOptions = {},
): SectionedRuntimeConfig {
  const result: SectionedRuntimeConfig = {
    public: {},
    private: {},
  };
  const contextOutputKey = options.contextOutputKey ?? '__contexts';

  const filteredFragments = filterFragments({
    fragments,
    ...(options.contextInputKey ? { contextInputKey: options.contextInputKey } : {}),
    ...(options.scopeIds ? { scopeIds: options.scopeIds } : {}),
  });

  for (const fragment of filteredFragments) {
    for (const visibility of runtimeConfigVisibilities) {
      const section = getSection(fragment.config, visibility);
      if (!section) continue;

      for (const [key, value] of Object.entries(section)) {
        assignDefined(
          result[visibility],
          createRuntimeConfigKey(fragment.scopeId, key, options),
          value,
        );
      }
    }

    if (options.includeContexts === false) continue;

    for (const [contextId, context] of Object.entries(fragment.config.contexts ?? {})) {
      for (const visibility of runtimeConfigVisibilities) {
        const section = getSection(context, visibility);
        if (!section) continue;

        const contexts =
          (result[visibility][contextOutputKey] as
            | Record<string, RuntimeConfigSection>
            | undefined) ?? {};
        const contextValues = contexts[contextId] ?? {};

        for (const [key, value] of Object.entries(section)) {
          assignDefined(
            contextValues,
            createRuntimeConfigKey(fragment.scopeId, key, options),
            value,
          );
        }

        contexts[contextId] = contextValues;
        result[visibility][contextOutputKey] = contexts;
      }
    }
  }

  return result;
}

export function projectRuntimeConfigFragment(
  scopeId: string,
  config: RuntimeConfigFragment,
  options: ProjectRuntimeConfigFragmentOptions = {},
): SectionedRuntimeConfig {
  return projectSectionedRuntimeConfig(new Map([[scopeId, config]]), options);
}

export function projectRuntimeConfigNamespace(
  scopeId: string,
  config: RuntimeConfigFragment,
  options: ProjectRuntimeConfigNamespaceOptions = {},
): RuntimeConfigNamespaceProjection {
  return projectRuntimeConfigNamespaces([{ scopeId, config }], options);
}

export function projectRuntimeConfigNamespaces(
  fragments: Iterable<NamedRuntimeConfigFragment> | RuntimeConfigFragmentMap,
  options: ProjectRuntimeConfigNamespacesOptions = {},
): RuntimeConfigNamespaceProjection {
  const result: RuntimeConfigNamespaceProjection = {
    public: {},
  };
  const namespaceStrategy = options.namespaceStrategy ?? 'nested';

  const filteredFragments = filterFragments({
    fragments,
    ...(options.contextInputKey ? { contextInputKey: options.contextInputKey } : {}),
    ...(options.scopeIds ? { scopeIds: options.scopeIds } : {}),
  });

  for (const fragment of filteredFragments) {
    const context = options.contextId ? fragment.config.contexts?.[options.contextId] : undefined;
    const publicSection = {
      ...(fragment.config.public ?? {}),
      ...(context?.public ?? {}),
    };
    const privateSection = {
      ...(fragment.config.private ?? {}),
      ...(context?.private ?? {}),
    };

    if (namespaceStrategy === 'flat') {
      Object.assign(result.public, publicSection);
      Object.assign(result, privateSection);
      continue;
    }

    if (Object.keys(publicSection).length) {
      result.public[fragment.scopeId] = {
        ...(result.public[fragment.scopeId] ?? {}),
        ...publicSection,
      };
    }

    if (Object.keys(privateSection).length) {
      result[fragment.scopeId] = {
        ...(result[fragment.scopeId] ?? {}),
        ...privateSection,
      };
    }
  }

  return result;
}
