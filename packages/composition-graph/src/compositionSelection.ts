import { getCompositionProvenance } from './descriptorGraph';
import { assertKnownDescriptorIds } from './descriptorMap';
import type {
  CompositionPolicy,
  CompositionProvenance,
  CompositionSelection,
  Descriptor,
  DescriptorCatalog,
  DescriptorId,
  RelationDescriptor,
  RelationRole,
} from './types';

export const defaultCompositionPolicy: CompositionPolicy = {
  resolutionRelationIds: ['dependencies'],
  provenanceRelationIds: ['dependencies'],
  inspectionRelationIds: ['dependencies'],
};

const POLICY_FIELD: Record<RelationRole, keyof CompositionPolicy> = {
  resolution: 'resolutionRelationIds',
  provenance: 'provenanceRelationIds',
  inspection: 'inspectionRelationIds',
};

// The policy that walks `relationDescriptors` in the roles they declare, on top of
// the lists `policy` already names (the defaults where it names none). A host adds a
// relation by registering it, and the relations the composition already resolves stay
// resolved: naming one list in a policy replaces that list, and a host that only
// wanted to add an inspection edge would otherwise drop the relations providers
// resolve through.
export function extendCompositionPolicy(
  policy: Partial<CompositionPolicy> | undefined,
  relationDescriptors: readonly RelationDescriptor[] | undefined,
): Partial<CompositionPolicy> {
  const extended: Partial<CompositionPolicy> = { ...policy };

  for (const relationDescriptor of relationDescriptors ?? []) {
    for (const role of relationDescriptor.roles ?? []) {
      const field = POLICY_FIELD[role];
      const current = extended[field] ?? policy?.[field] ?? defaultCompositionPolicy[field];
      extended[field] = [...new Set([...current, relationDescriptor.id])];
    }
  }

  return extended;
}

function resolvePolicy(policy?: Partial<CompositionPolicy>): CompositionPolicy {
  return {
    ...defaultCompositionPolicy,
    ...policy,
    resolutionRelationIds:
      policy?.resolutionRelationIds ?? defaultCompositionPolicy.resolutionRelationIds,
    provenanceRelationIds:
      policy?.provenanceRelationIds ?? defaultCompositionPolicy.provenanceRelationIds,
    inspectionRelationIds:
      policy?.inspectionRelationIds ?? defaultCompositionPolicy.inspectionRelationIds,
  };
}

export function createCompositionSelection(input: {
  catalog: DescriptorCatalog;
  selected?: DescriptorId[];
  baseDescriptors?: DescriptorId[];
  policy?: Partial<CompositionPolicy>;
}): CompositionSelection {
  const catalog = input.catalog;
  const descriptorMap = catalog.getDescriptorMap();
  const selected = [...new Set(input.selected ?? [])].filter(Boolean).sort();
  const baseDescriptors = [...new Set(input.baseDescriptors ?? [])].filter(Boolean).sort();

  assertKnownDescriptorIds(descriptorMap, selected, 'selected descriptors');
  assertKnownDescriptorIds(descriptorMap, baseDescriptors, 'base descriptors');

  const policy = resolvePolicy(input.policy);
  const resolved = catalog.getTransitiveTargets({
    start: [...selected, ...baseDescriptors],
    relationIds: policy.resolutionRelationIds,
  });

  let resolvedDescriptorsCache: Descriptor[] | undefined;
  let provenanceCache: CompositionProvenance[] | undefined;

  const getResolvedDescriptors = (): Descriptor[] => {
    if (!resolvedDescriptorsCache) {
      resolvedDescriptorsCache = resolved
        .map((descriptorId) => descriptorMap.get(descriptorId))
        .filter((descriptor): descriptor is Descriptor => Boolean(descriptor));
    }

    return resolvedDescriptorsCache;
  };

  const getProvenance = (): CompositionProvenance[] => {
    if (!provenanceCache) {
      provenanceCache = getCompositionProvenance({
        graph: catalog.getGraph(),
        descriptorIds: resolved,
        selected,
        baseDescriptors,
        relationIds: policy.provenanceRelationIds,
      });
    }

    return provenanceCache;
  };

  return {
    getCatalog: () => catalog,
    getGraph: () => catalog.getGraph(),
    getSelected: () => [...selected],
    getBaseDescriptors: () => [...baseDescriptors],
    getResolved: () => [...resolved],
    getResolvedDescriptors,
    getProvenance,
    getDependentsFor: (target, dependentsInput = {}) => {
      return catalog.getDependents({
        target,
        relationIds: dependentsInput.relationIds ?? policy.resolutionRelationIds,
        ...(dependentsInput.transitive !== undefined
          ? { transitive: dependentsInput.transitive }
          : {}),
      });
    },
    explain: (explainInput) => {
      return catalog.explain({
        from: explainInput.from,
        to: explainInput.to,
        relationIds: explainInput.relationIds ?? policy.inspectionRelationIds,
      });
    },
    explainPathsBatch: (batchInput) => {
      return catalog.explainPathsBatch({
        pairs: batchInput.pairs,
        relationIds: batchInput.relationIds ?? policy.inspectionRelationIds,
      });
    },
  };
}
