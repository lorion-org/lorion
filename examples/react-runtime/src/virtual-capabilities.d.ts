declare module 'virtual:capabilities' {
  import type { ProviderSelectionResolution, RuntimeCapability } from '@lorion-org/react';

  export const capabilityModules: RuntimeCapability[];
  export const discoveredCapabilityIds: string[];
  export const resolvedCapabilityIds: string[];
  export const resolvedCapabilityVersions: Record<string, string>;
  export const selectedCapabilityIds: string[];
  export const providerSelection: ProviderSelectionResolution;
}

declare module 'virtual:lorion-contributions' {
  import type { ContributionPlan, ContributionModule } from '@lorion-org/contributions';
  export const contributionPlan: ContributionPlan;
  export const contributionModules: readonly ContributionModule[];
}
