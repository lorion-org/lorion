export type DescriptorId = string;

export type DescriptorIds = DescriptorId[];

export type VersionConstraintMap = Record<DescriptorId, string>;

export type RelationId = string;

export type Descriptor = {
  id: DescriptorId;
  version: string;
  providesFor?: string;
  capabilities?: string[];
  dependencies?: VersionConstraintMap;
  disabled?: boolean;
  location?: string;
  [key: string]: unknown;
};

export type DescriptorMap = Map<DescriptorId, Descriptor>;

export type RelationDescriptor = {
  id: RelationId;
  field?: string;
};

export type DescriptorEdge = {
  from: DescriptorId;
  to: DescriptorId;
  relation: RelationId;
  source: 'descriptor' | 'derived';
};

export type ResolutionStep = {
  from: DescriptorId;
  to: DescriptorId;
  relation: RelationId;
};

export type CompositionOriginType = 'selected' | 'base' | 'resolved';

export type CompositionProvenanceOrigin = {
  originType: CompositionOriginType;
  path: ResolutionStep[];
};

export type CompositionProvenance = {
  descriptorId: DescriptorId;
  origins: CompositionProvenanceOrigin[];
};

export type DescriptorGraph = {
  descriptorMap: DescriptorMap;
  edges: DescriptorEdge[];
  outgoing: Map<DescriptorId, DescriptorEdge[]>;
  incoming: Map<DescriptorId, DescriptorEdge[]>;
  relationDescriptors: Map<RelationId, RelationDescriptor>;
};

export type DescriptorProfile = {
  id: DescriptorId;
  location?: string;
  disabled: boolean;
  providesFor?: string;
  capabilities: string[];
  outgoing: Record<RelationId, string[]>;
  incoming: Record<RelationId, string[]>;
};

export type CompositionPolicy = {
  resolutionRelationIds: RelationId[];
  provenanceRelationIds: RelationId[];
  inspectionRelationIds: RelationId[];
};

export type DescriptorCatalog = {
  getDescriptorMap: () => DescriptorMap;
  getAllDescriptors: () => Descriptor[];
  getDescriptor: (id: DescriptorId) => Descriptor | undefined;
  getGraph: () => DescriptorGraph;
  getRelationDescriptors: () => RelationDescriptor[];
  getProfiles: (input?: { ids?: DescriptorId[]; includeDisabled?: boolean }) => DescriptorProfile[];
  getIncomingRelationMap: (relationId: RelationId) => Map<DescriptorId, DescriptorId[]>;
  getTransitiveTargets: (input: {
    start: DescriptorId[];
    relationIds: RelationId[];
  }) => DescriptorIds;
  getDependents: (input: {
    target: DescriptorId;
    relationIds: RelationId[];
    transitive?: boolean;
  }) => DescriptorIds;
  explain: (input: {
    from: DescriptorId;
    to: DescriptorId;
    relationIds: RelationId[];
  }) => ResolutionStep[];
  explainPathsBatch: (input: {
    pairs: Array<{ from: DescriptorId; to: DescriptorId }>;
    relationIds: RelationId[];
  }) => Array<{ from: DescriptorId; to: DescriptorId; path: ResolutionStep[] }>;
  resolveSelection: (input: {
    selected?: DescriptorId[];
    baseDescriptors?: DescriptorId[];
    policy?: Partial<CompositionPolicy>;
  }) => CompositionSelection;
};

export type CompositionSelection = {
  getCatalog: () => DescriptorCatalog;
  getGraph: () => DescriptorGraph;
  getSelected: () => DescriptorIds;
  getBaseDescriptors: () => DescriptorIds;
  getResolved: () => DescriptorIds;
  getResolvedDescriptors: () => Descriptor[];
  getProvenance: () => CompositionProvenance[];
  getDependentsFor: (
    target: DescriptorId,
    input?: { transitive?: boolean; relationIds?: RelationId[] },
  ) => DescriptorIds;
  explain: (input: {
    from: DescriptorId;
    to: DescriptorId;
    relationIds?: RelationId[];
  }) => ResolutionStep[];
  explainPathsBatch: (input: {
    pairs: Array<{ from: DescriptorId; to: DescriptorId }>;
    relationIds?: RelationId[];
  }) => Array<{ from: DescriptorId; to: DescriptorId; path: ResolutionStep[] }>;
};
