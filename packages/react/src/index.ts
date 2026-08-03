import { createContext, createElement, useContext, type ReactElement, type ReactNode } from 'react';
import {
  assertKnownDescriptorIds,
  createDescriptorCatalog,
  type DescriptorCatalog,
} from '@lorion-org/composition-graph';
import type { SchemaDescriptor } from '@lorion-org/descriptor-discovery';
import { defaultCapabilityRelationDescriptors } from './relations';

export {
  createCapabilityCompositionPolicy,
  defaultCapabilityRelationDescriptors,
  defaultCapabilityResolutionRelations,
} from './relations';
export * from './runtime-config';
export type {
  ProviderSelectionResolution,
  ProviderSlotResolution,
} from '@lorion-org/provider-selection';

// The runtime's descriptor is the shared one. It described the same fields a fifth
// time, with `runtimeConfig` narrower than the code accepts and a `description`
// field the schema does not declare; a host attaching its own data still can,
// through the descriptor's index signature.
export type CapabilityManifest = SchemaDescriptor;

export type ExtensionPoint<T> = {
  id: string;
  readonly value?: T;
};

export type CapabilityContribution<T = unknown> = {
  extensionPoint: ExtensionPoint<T>;
  values: readonly T[];
};

export type RuntimeCapability = {
  id: string;
  manifest: CapabilityManifest;
  contributions?: readonly CapabilityContribution[];
};

export type CapabilityRuntime = {
  capabilities: readonly RuntimeCapability[];
  catalog: DescriptorCatalog;
  getContributions: <T>(extensionPoint: ExtensionPoint<T>) => T[];
};

export type ContributionContract<T> = {
  define: (values: readonly T[]) => CapabilityContribution<T>;
  extensionPoint: ExtensionPoint<T>;
  get: (runtime: CapabilityRuntime) => T[];
  use: () => T[];
};

export function defineExtensionPoint<T>(id: string): ExtensionPoint<T> {
  return { id };
}

export function defineContribution<T>(
  extensionPoint: ExtensionPoint<T>,
  values: readonly T[],
): CapabilityContribution<T> {
  return { extensionPoint, values };
}

export function createContributionContract<T>(id: string): ContributionContract<T> {
  const extensionPoint = defineExtensionPoint<T>(id);

  return {
    extensionPoint,
    define: (values) => defineContribution(extensionPoint, values),
    get: (runtime) => runtime.getContributions(extensionPoint),
    use: () => useCapabilityRuntime().getContributions(extensionPoint),
  };
}

export function defineCapability(capability: RuntimeCapability): RuntimeCapability {
  if (capability.id !== capability.manifest.id) {
    throw new Error(
      `Capability "${capability.id}" must match capability.json id "${capability.manifest.id}".`,
    );
  }

  return capability;
}

export function createCapabilityRuntime(
  capabilities: readonly RuntimeCapability[],
): CapabilityRuntime {
  const enabledCapabilities = capabilities.filter(
    (capability) => capability.manifest.disabled !== true,
  );
  const catalog = createCapabilityCatalog(enabledCapabilities);

  assertUniqueCapabilities(enabledCapabilities);
  assertKnownCapabilityDependencies(enabledCapabilities, catalog);

  const contributions = collectContributions(enabledCapabilities);

  return {
    capabilities: Object.freeze([...enabledCapabilities]),
    catalog,
    getContributions: <T>(extensionPoint: ExtensionPoint<T>) =>
      [...(contributions.get(extensionPoint.id) ?? [])] as T[],
  };
}

const CapabilityRuntimeContext = createContext<CapabilityRuntime | null>(null);

export type CapabilityRuntimeProviderProps = {
  children: ReactNode;
  runtime: CapabilityRuntime;
};

export function CapabilityRuntimeProvider({
  children,
  runtime,
}: CapabilityRuntimeProviderProps): ReactElement {
  return createElement(CapabilityRuntimeContext.Provider, { value: runtime }, children);
}

export function useCapabilityRuntime(): CapabilityRuntime {
  const runtime = useContext(CapabilityRuntimeContext);

  if (!runtime) {
    throw new Error('useCapabilityRuntime must be used inside CapabilityRuntimeProvider.');
  }

  return runtime;
}

function assertUniqueCapabilities(capabilities: readonly RuntimeCapability[]): void {
  const seen = new Set<string>();

  for (const capability of capabilities) {
    if (seen.has(capability.id)) {
      throw new Error(`Duplicate capability id "${capability.id}".`);
    }

    seen.add(capability.id);
  }
}

function assertKnownCapabilityDependencies(
  capabilities: readonly RuntimeCapability[],
  catalog: DescriptorCatalog,
): void {
  for (const capability of capabilities) {
    assertKnownDescriptorIds(
      catalog.getDescriptorMap(),
      Object.keys(capability.manifest.dependencies ?? {}),
      `capability "${capability.id}" dependencies`,
    );
  }
}

function collectContributions(capabilities: readonly RuntimeCapability[]): Map<string, unknown[]> {
  const contributions = new Map<string, unknown[]>();

  for (const capability of capabilities) {
    for (const contribution of capability.contributions ?? []) {
      const bucket = contributions.get(contribution.extensionPoint.id) ?? [];
      bucket.push(...contribution.values);
      contributions.set(contribution.extensionPoint.id, bucket);
    }
  }

  return contributions;
}

function createCapabilityCatalog(capabilities: readonly RuntimeCapability[]): DescriptorCatalog {
  return createDescriptorCatalog({
    descriptors: capabilities.map((capability) => capability.manifest),
    relationDescriptors: defaultCapabilityRelationDescriptors,
  });
}
