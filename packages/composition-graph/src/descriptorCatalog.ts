import {
  buildDescriptorGraph,
  defaultRelationDescriptors,
  explainPath,
  explainPathsBatch,
  getDependents,
  getIncomingRelationMap,
  getTransitiveTargets,
} from './descriptorGraph';
import { buildDescriptorMap } from './descriptorMap';
import { createCompositionSelection } from './compositionSelection';
import type {
  Descriptor,
  DescriptorCatalog,
  DescriptorGraph,
  DescriptorMap,
  DescriptorProfile,
  RelationDescriptor,
  RelationId,
} from './types';

function createRelationRecord(
  relationIds: RelationId[],
  values: Array<[RelationId, string[]]>,
): Record<RelationId, string[]> {
  return Object.fromEntries(
    relationIds.map((relationId) => {
      const entry = values.find(([relation]) => relation === relationId);

      return [relationId, entry?.[1] ?? []];
    }),
  );
}

function resolveRelationDescriptors(
  relationDescriptors?: RelationDescriptor[],
): RelationDescriptor[] {
  const registry = new Map<string, RelationDescriptor>();

  for (const relationDescriptor of defaultRelationDescriptors) {
    registry.set(relationDescriptor.id, relationDescriptor);
  }

  for (const relationDescriptor of relationDescriptors ?? []) {
    registry.set(relationDescriptor.id, relationDescriptor);
  }

  return Array.from(registry.values()).sort((left, right) => left.id.localeCompare(right.id));
}

function buildDescriptorProfile(
  descriptor: Descriptor,
  relationIds: RelationId[],
  graph: DescriptorGraph,
): DescriptorProfile {
  const outgoing = createRelationRecord(
    relationIds,
    relationIds.map((relationId) => {
      const targets = (graph.outgoing.get(descriptor.id) ?? [])
        .filter((edge) => edge.relation === relationId)
        .map((edge) => edge.to)
        .sort();

      return [relationId, targets];
    }),
  );
  const incoming = createRelationRecord(
    relationIds,
    relationIds.map((relationId) => {
      const sources = (graph.incoming.get(descriptor.id) ?? [])
        .filter((edge) => edge.relation === relationId)
        .map((edge) => edge.from)
        .sort();

      return [relationId, sources];
    }),
  );

  return {
    id: descriptor.id,
    disabled: descriptor.disabled === true,
    capabilities: [...(descriptor.capabilities ?? [])].sort(),
    ...(descriptor.location ? { location: descriptor.location } : {}),
    ...(typeof descriptor.providesFor === 'string' ? { providesFor: descriptor.providesFor } : {}),
    outgoing,
    incoming,
  };
}

export function createDescriptorCatalog(input: {
  descriptorMap?: DescriptorMap;
  descriptors?: Descriptor[];
  relationDescriptors?: RelationDescriptor[];
}): DescriptorCatalog {
  const descriptorMap = input.descriptorMap ?? buildDescriptorMap(input.descriptors ?? []);
  const relationDescriptors = resolveRelationDescriptors(input.relationDescriptors);
  const graph = buildDescriptorGraph({
    descriptorMap,
    relationDescriptors,
  });

  const catalog: DescriptorCatalog = {
    getDescriptorMap: () => descriptorMap,
    getAllDescriptors: () => Array.from(descriptorMap.values()),
    getDescriptor: (id) => descriptorMap.get(id),
    getGraph: () => graph,
    getRelationDescriptors: () => Array.from(graph.relationDescriptors.values()),
    getProfiles: (profileInput = {}) => {
      const ids = [...new Set(profileInput.ids ?? [])].filter(Boolean).sort();
      const descriptors = ids.length
        ? ids
            .map((id) => descriptorMap.get(id))
            .filter((descriptor): descriptor is Descriptor => Boolean(descriptor))
        : Array.from(descriptorMap.values())
            .filter(
              (descriptor) => profileInput.includeDisabled === true || descriptor.disabled !== true,
            )
            .sort((left, right) => left.id.localeCompare(right.id));

      return descriptors.map((descriptor) =>
        buildDescriptorProfile(descriptor, Array.from(graph.relationDescriptors.keys()), graph),
      );
    },
    getIncomingRelationMap: (relationId) => getIncomingRelationMap({ graph, relationId }),
    getTransitiveTargets: (transitiveInput) =>
      getTransitiveTargets({
        graph,
        start: transitiveInput.start,
        relationIds: transitiveInput.relationIds,
      }),
    getDependents: (dependentsInput) =>
      getDependents({
        graph,
        target: dependentsInput.target,
        relationIds: dependentsInput.relationIds,
        ...(dependentsInput.transitive !== undefined
          ? { transitive: dependentsInput.transitive }
          : {}),
      }),
    explain: (explainInput) =>
      explainPath({
        graph,
        from: explainInput.from,
        to: explainInput.to,
        relationIds: explainInput.relationIds,
      }),
    explainPathsBatch: (batchInput) =>
      explainPathsBatch({
        graph,
        pairs: batchInput.pairs,
        relationIds: batchInput.relationIds,
      }),
    resolveSelection: (selectionInput) =>
      createCompositionSelection({
        catalog,
        ...selectionInput,
      }),
  };

  return catalog;
}
