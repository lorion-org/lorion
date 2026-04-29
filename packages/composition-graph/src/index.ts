export { assertKnownDescriptorIds, buildDescriptorMap, parseDescriptorIds } from './descriptorMap';
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
export { createCompositionSelection, defaultCompositionPolicy } from './compositionSelection';
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
  ResolutionStep,
  VersionConstraintMap,
} from './types';
