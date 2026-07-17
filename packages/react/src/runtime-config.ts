import { createContext, createElement, useContext, type ReactElement, type ReactNode } from 'react';
import type { RuntimeConfigSection } from '@lorion-org/runtime-config';

export type CapabilityRuntimeConfig = {
  public: Record<string, RuntimeConfigSection>;
};

export type CapabilityRuntimeConfigFragment<T extends RuntimeConfigSection = RuntimeConfigSection> =
  {
    public: T;
  };

export type CapabilityRuntimeConfigProviderProps = {
  children: ReactNode;
  runtimeConfig: CapabilityRuntimeConfig;
};

const emptyRuntimeConfig: CapabilityRuntimeConfig = Object.freeze({ public: Object.freeze({}) });
const CapabilityRuntimeConfigContext = createContext<CapabilityRuntimeConfig>(emptyRuntimeConfig);

export function CapabilityRuntimeConfigProvider({
  children,
  runtimeConfig,
}: CapabilityRuntimeConfigProviderProps): ReactElement {
  return createElement(CapabilityRuntimeConfigContext.Provider, { value: runtimeConfig }, children);
}

export function useCapabilityRuntimeConfigScope<
  T extends RuntimeConfigSection = RuntimeConfigSection,
>(capabilityId: string): T {
  return getCapabilityRuntimeConfigScope<T>(useCapabilityRuntimeConfigRoot(), capabilityId);
}

export function useCapabilityRuntimeConfig<T extends RuntimeConfigSection = RuntimeConfigSection>(
  capabilityId: string,
): CapabilityRuntimeConfigFragment<T> {
  return getCapabilityRuntimeConfig<T>(useCapabilityRuntimeConfigRoot(), capabilityId);
}

export function useCapabilityRuntimeConfigRoot(): CapabilityRuntimeConfig {
  return useContext(CapabilityRuntimeConfigContext);
}

export function getCapabilityRuntimeConfigScope<
  T extends RuntimeConfigSection = RuntimeConfigSection,
>(runtimeConfig: CapabilityRuntimeConfig, capabilityId: string): T {
  const publicConfig = runtimeConfig.public[capabilityId];

  return (
    publicConfig && typeof publicConfig === 'object' && !Array.isArray(publicConfig)
      ? publicConfig
      : {}
  ) as T;
}

export function getCapabilityRuntimeConfig<T extends RuntimeConfigSection = RuntimeConfigSection>(
  runtimeConfig: CapabilityRuntimeConfig,
  capabilityId: string,
): CapabilityRuntimeConfigFragment<T> {
  return {
    public: getCapabilityRuntimeConfigScope<T>(runtimeConfig, capabilityId),
  };
}
