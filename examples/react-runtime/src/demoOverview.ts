import { resolvedCapabilityVersions } from 'virtual:capabilities';
import type { CapabilityRuntime } from '@lorion-org/react';
import {
  providerSelection,
  selectedCapabilityIds,
  discoveredCapabilityIds,
} from 'virtual:capabilities';

export function createDemoOverview(runtime: CapabilityRuntime) {
  const resolvedCapabilityIds = runtime.catalog
    .getAllDescriptors()
    .map((descriptor) => descriptor.id)
    .sort((left, right) => left.localeCompare(right));
  const resolvedSet = new Set(resolvedCapabilityIds);

  return {
    resolvedCapabilityVersions,
    capabilitySelection: {
      discoveredCapabilityIds,
      notInjectedCapabilityIds: discoveredCapabilityIds.filter((id) => !resolvedSet.has(id)),
      resolvedCapabilityIds,
      selectedCapabilityIds,
    },
    providerSelection,
  };
}
