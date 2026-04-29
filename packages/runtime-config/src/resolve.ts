import { createRuntimeConfigKey, type RuntimeConfigKeyOptions } from './key';
import type { ConfigVisibility, RuntimeConfigSection } from './types';

export type ResolveRuntimeConfigValueOptions<T = unknown> = RuntimeConfigKeyOptions & {
  contextId?: string;
  contextOutputKey?: string;
  defaultValue?: T;
};

export type ResolveRuntimeConfigValueFromRuntimeConfigOptions<T = unknown> =
  ResolveRuntimeConfigValueOptions<T> & {
    visibility?: ConfigVisibility;
  };

export function resolveRuntimeConfigValue<T = unknown>(
  scopeConfig: RuntimeConfigSection | undefined,
  scopeId: string,
  key: string,
  options: ResolveRuntimeConfigValueOptions<T> = {},
): T | undefined {
  const configKey = createRuntimeConfigKey(scopeId, key, options);
  const contextOutputKey = options.contextOutputKey ?? '__contexts';

  if (options.contextId) {
    const contexts = scopeConfig?.[contextOutputKey] as
      | Record<string, RuntimeConfigSection>
      | undefined;
    const contextValue = contexts?.[options.contextId]?.[configKey] as T | undefined;
    if (contextValue !== undefined) {
      return contextValue;
    }
  }

  const globalValue = scopeConfig?.[configKey] as T | undefined;
  if (globalValue !== undefined) {
    return globalValue;
  }

  return options.defaultValue;
}

export function resolveRuntimeConfigValueFromRuntimeConfig<T = unknown>(
  runtimeConfig: Partial<Record<ConfigVisibility, RuntimeConfigSection | undefined>>,
  scopeId: string,
  key: string,
  options: ResolveRuntimeConfigValueFromRuntimeConfigOptions<T> = {},
): T | undefined {
  const { visibility = 'public', ...resolveOptions } = options;

  return resolveRuntimeConfigValue(runtimeConfig[visibility], scopeId, key, resolveOptions);
}
