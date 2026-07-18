// The capability relations and composition policy are owned by
// @lorion-org/descriptor-selection. They are re-exported here under the React
// adapter's public names for backward compatibility; no logic is duplicated.
export {
  providerRelationDescriptors as defaultCapabilityRelationDescriptors,
  descriptorSelectionPolicy as createCapabilityCompositionPolicy,
  defaultResolutionRelations as defaultCapabilityResolutionRelations,
} from '@lorion-org/descriptor-selection';
