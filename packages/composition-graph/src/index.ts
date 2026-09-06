export {
  assertKnownDescriptorIds,
  buildDescriptorMap,
  parseDescriptorIds,
  resolveDescriptorSelectionSeed,
} from './descriptorMap';
export {
  buildDescriptorGraph,
  defaultRelationDescriptors,
  explainPath,
  explainPathsBatch,
  getCompositionProvenance,
  getDependents,
  getIncomingRelationMap,
  getTransitiveTargets,
} from './descriptorGraph';
export { createDescriptorCatalog } from './descriptorCatalog';
export {
  createCompositionSelection,
  defaultCompositionPolicy,
  extendCompositionPolicy,
} from './compositionSelection';
export { assertKnownReferences } from './references';
export {
  CONTRIBUTION_FIELD,
  CONTRIBUTION_POINT_FIELD,
  contributionRelationDescriptor,
  resolveContributions,
} from './contributions';
export type {
  ContributionEdge,
  ContributionRelationOptions,
  ContributionRelations,
} from './contributions';
export type {
  CompositionOriginType,
  CompositionPolicy,
  CompositionProvenance,
  CompositionProvenanceOrigin,
  CompositionSelection,
  Descriptor,
  DescriptorCatalog,
  DescriptorEdge,
  DescriptorGraph,
  DescriptorId,
  DescriptorIds,
  DescriptorMap,
  DescriptorProfile,
  RelationDescriptor,
  RelationId,
  RelationRole,
  ResolutionStep,
  VersionConstraintMap,
} from './types';
export type { DescriptorSelectionSeedInput } from './descriptorMap';
