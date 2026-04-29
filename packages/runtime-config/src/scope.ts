import { stripRuntimeConfigScopePrefix, type RuntimeConfigKeyOptions } from './key';
import { resolveRuntimeConfigValue } from './resolve';
import type { ConfigVisibility, RuntimeConfigContext, RuntimeConfigSection } from './types';

export type GetRuntimeConfigScopeOptions = RuntimeConfigKeyOptions & {
  contextId?: string;
  contextOutputKey?: string;
  keys?: string[];
  visibility?: ConfigVisibility;
};

export type GetRuntimeConfigFragmentOptions = RuntimeConfigKeyOptions & {
  contextId?: string;
  contextOutputKey?: string;
  keys?: Partial<Record<ConfigVisibility, string[]>>;
};

function assignDefined(target: RuntimeConfigSection, key: string, value: unknown): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

function collectRuntimeConfigScopeValues(input: {
  scopeConfig: RuntimeConfigSection | undefined;
  scopeId: string;
  options: RuntimeConfigKeyOptions;
}): RuntimeConfigSection {
  const values: RuntimeConfigSection = {};

  for (const [configKey, value] of Object.entries(input.scopeConfig ?? {})) {
    if (configKey.startsWith('__')) continue;

    const key = stripRuntimeConfigScopePrefix(input.scopeId, configKey, input.options);
    if (key) assignDefined(values, key, value);
  }

  return values;
}

export function getRuntimeConfigScope<T extends RuntimeConfigSection = RuntimeConfigSection>(
  runtimeConfig: Partial<Record<ConfigVisibility, RuntimeConfigSection | undefined>>,
  scopeId: string,
  options: GetRuntimeConfigScopeOptions = {},
): T {
  const {
    contextId,
    contextOutputKey = '__contexts',
    keys,
    visibility = 'public',
    ...keyOptions
  } = options;
  const scopeConfig = runtimeConfig[visibility];

  if (keys) {
    return Object.fromEntries(
      keys
        .map((key) => {
          const value = resolveRuntimeConfigValue(scopeConfig, scopeId, key, {
            ...keyOptions,
            ...(contextId ? { contextId } : {}),
            contextOutputKey,
          });

          return [key, value] as const;
        })
        .filter(([, value]) => value !== undefined),
    ) as T;
  }

  const values = collectRuntimeConfigScopeValues({
    scopeConfig,
    scopeId,
    options: keyOptions,
  });

  if (!contextId) return values as T;

  const contexts = scopeConfig?.[contextOutputKey] as
    | Record<string, RuntimeConfigSection>
    | undefined;
  const contextValues = collectRuntimeConfigScopeValues({
    scopeConfig: contexts?.[contextId],
    scopeId,
    options: keyOptions,
  });

  return {
    ...values,
    ...contextValues,
  } as T;
}

export function getPublicRuntimeConfigScope<T extends RuntimeConfigSection = RuntimeConfigSection>(
  runtimeConfig: Partial<Record<ConfigVisibility, RuntimeConfigSection | undefined>>,
  scopeId: string,
  options: Omit<GetRuntimeConfigScopeOptions, 'visibility'> = {},
): T {
  return getRuntimeConfigScope<T>(runtimeConfig, scopeId, {
    ...options,
    visibility: 'public',
  });
}

export function getPrivateRuntimeConfigScope<T extends RuntimeConfigSection = RuntimeConfigSection>(
  runtimeConfig: Partial<Record<ConfigVisibility, RuntimeConfigSection | undefined>>,
  scopeId: string,
  options: Omit<GetRuntimeConfigScopeOptions, 'visibility'> = {},
): T {
  return getRuntimeConfigScope<T>(runtimeConfig, scopeId, {
    ...options,
    visibility: 'private',
  });
}

export function getRuntimeConfigFragment(
  runtimeConfig: Partial<Record<ConfigVisibility, RuntimeConfigSection | undefined>>,
  scopeId: string,
  options: GetRuntimeConfigFragmentOptions = {},
): RuntimeConfigContext {
  const { keys, ...scopeOptions } = options;
  const publicOptions = keys?.public ? { ...scopeOptions, keys: keys.public } : scopeOptions;
  const privateOptions = keys?.private ? { ...scopeOptions, keys: keys.private } : scopeOptions;

  return {
    public: getPublicRuntimeConfigScope(runtimeConfig, scopeId, publicOptions),
    private: getPrivateRuntimeConfigScope(runtimeConfig, scopeId, privateOptions),
  };
}
