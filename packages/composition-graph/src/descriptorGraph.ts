import type {
  CompositionOriginType,
  CompositionProvenance,
  CompositionProvenanceOrigin,
  Descriptor,
  DescriptorEdge,
  DescriptorGraph,
  DescriptorId,
  DescriptorIds,
  DescriptorMap,
  RelationDescriptor,
  RelationId,
  ResolutionStep,
} from './types';

const createEmptyAdjacency = (
  descriptorMap: DescriptorMap,
): Map<DescriptorId, DescriptorEdge[]> => {
  return new Map(
    Array.from(descriptorMap.keys())
      .sort()
      .map((id) => [id, []]),
  );
};

const sortEdges = (edges: DescriptorEdge[]): DescriptorEdge[] => {
  return [...edges].sort(
    (left, right) =>
      left.from.localeCompare(right.from) ||
      left.to.localeCompare(right.to) ||
      left.relation.localeCompare(right.relation),
  );
};

export const defaultRelationDescriptors: RelationDescriptor[] = [
  {
    id: 'dependencies',
    field: 'dependencies',
  },
];

function isVersionConstraintMap(value: unknown): value is Record<string, string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRelationTargets(
  descriptor: Descriptor,
  relationDescriptor: RelationDescriptor,
): DescriptorId[] {
  const field = relationDescriptor.field ?? relationDescriptor.id;
  const relationValue = descriptor[field];

  if (!isVersionConstraintMap(relationValue)) return [];

  return Object.keys(relationValue).sort();
}

function createOriginType(path: ResolutionStep[]): CompositionOriginType {
  return path.length ? 'resolved' : 'selected';
}

function compareOrigins(
  left: CompositionProvenanceOrigin,
  right: CompositionProvenanceOrigin,
): number {
  const leftPath = JSON.stringify(left.path);
  const rightPath = JSON.stringify(right.path);

  return left.originType.localeCompare(right.originType) || leftPath.localeCompare(rightPath);
}

export function buildDescriptorGraph(input: {
  descriptorMap: DescriptorMap;
  relationDescriptors?: RelationDescriptor[];
}): DescriptorGraph {
  const relationDescriptors = input.relationDescriptors ?? defaultRelationDescriptors;
  const descriptorRegistry = new Map<RelationId, RelationDescriptor>(
    [...relationDescriptors]
      .sort((left, right) => left.id.localeCompare(right.id))
      .map((descriptor) => [descriptor.id, descriptor]),
  );
  const edges: DescriptorEdge[] = [];
  const outgoing = createEmptyAdjacency(input.descriptorMap);
  const incoming = createEmptyAdjacency(input.descriptorMap);

  for (const descriptor of Array.from(input.descriptorMap.values()).sort((left, right) =>
    left.id.localeCompare(right.id),
  )) {
    for (const relationDescriptor of descriptorRegistry.values()) {
      for (const target of getRelationTargets(descriptor, relationDescriptor)) {
        if (!input.descriptorMap.has(target)) continue;

        const edge: DescriptorEdge = {
          from: descriptor.id,
          to: target,
          relation: relationDescriptor.id,
          source: 'descriptor',
        };

        edges.push(edge);
        outgoing.get(descriptor.id)?.push(edge);
        incoming.get(target)?.push(edge);
      }
    }
  }

  for (const [id, nodeEdges] of outgoing) outgoing.set(id, sortEdges(nodeEdges));
  for (const [id, nodeEdges] of incoming) incoming.set(id, sortEdges(nodeEdges));

  return {
    descriptorMap: input.descriptorMap,
    edges: sortEdges(edges),
    outgoing,
    incoming,
    relationDescriptors: descriptorRegistry,
  };
}

export function getTransitiveTargets(input: {
  graph: DescriptorGraph;
  start: DescriptorId[];
  relationIds: RelationId[];
}): DescriptorIds {
  const allowedRelations = new Set(input.relationIds);
  const visited = new Set<DescriptorId>();
  const stack = [...input.start].sort().reverse();

  while (stack.length) {
    const current = stack.pop();
    if (!current || visited.has(current)) continue;

    visited.add(current);

    for (const edge of input.graph.outgoing.get(current) ?? []) {
      if (!allowedRelations.has(edge.relation) || visited.has(edge.to)) continue;
      stack.push(edge.to);
    }
  }

  return Array.from(visited)
    .filter((id) => input.graph.descriptorMap.has(id))
    .sort();
}

export function getIncomingRelationMap(input: {
  graph: DescriptorGraph;
  relationId: RelationId;
}): Map<DescriptorId, DescriptorId[]> {
  const entries = Array.from(input.graph.incoming.entries())
    .map(([target, edges]) => {
      const sources = edges
        .filter((edge) => edge.relation === input.relationId)
        .map((edge) => edge.from)
        .sort();

      return [target, sources] as const;
    })
    .filter(([, sources]) => sources.length > 0)
    .sort(([left], [right]) => left.localeCompare(right));

  return new Map(entries);
}

export function getDependents(input: {
  graph: DescriptorGraph;
  target: DescriptorId;
  relationIds: RelationId[];
  transitive?: boolean;
}): DescriptorIds {
  if (!input.graph.descriptorMap.has(input.target)) return [];

  const allowedRelations = new Set(input.relationIds);
  const visited = new Set<DescriptorId>();
  const queue: DescriptorId[] = [input.target];

  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;

    visited.add(current);

    if (input.transitive === false && current !== input.target) continue;

    for (const edge of input.graph.incoming.get(current) ?? []) {
      if (!allowedRelations.has(edge.relation) || visited.has(edge.from)) continue;
      queue.push(edge.from);
    }
  }

  visited.delete(input.target);

  return Array.from(visited).sort();
}

export function explainPath(input: {
  graph: DescriptorGraph;
  from: DescriptorId;
  to: DescriptorId;
  relationIds: RelationId[];
}): ResolutionStep[] {
  if (!input.graph.descriptorMap.has(input.from) || !input.graph.descriptorMap.has(input.to))
    return [];
  if (input.from === input.to) return [];

  const allowedRelations = new Set(input.relationIds);
  const visited = new Set<DescriptorId>([input.from]);
  const queue: Array<{ node: DescriptorId; path: ResolutionStep[] }> = [
    { node: input.from, path: [] },
  ];

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    for (const edge of input.graph.outgoing.get(current.node) ?? []) {
      if (!allowedRelations.has(edge.relation) || visited.has(edge.to)) continue;

      const nextPath: ResolutionStep[] = [
        ...current.path,
        {
          from: edge.from,
          to: edge.to,
          relation: edge.relation,
        },
      ];

      if (edge.to === input.to) return nextPath;

      visited.add(edge.to);
      queue.push({
        node: edge.to,
        path: nextPath,
      });
    }
  }

  return [];
}

export function explainPathsBatch(input: {
  graph: DescriptorGraph;
  pairs: Array<{ from: DescriptorId; to: DescriptorId }>;
  relationIds: RelationId[];
}): Array<{ from: DescriptorId; to: DescriptorId; path: ResolutionStep[] }> {
  return [...input.pairs]
    .sort((left, right) => left.from.localeCompare(right.from) || left.to.localeCompare(right.to))
    .map(({ from, to }) => ({
      from,
      to,
      path: explainPath({
        graph: input.graph,
        from,
        to,
        relationIds: input.relationIds,
      }),
    }));
}

export function getCompositionProvenance(input: {
  graph: DescriptorGraph;
  descriptorIds: DescriptorId[];
  selected: DescriptorId[];
  baseDescriptors?: DescriptorId[];
  relationIds: RelationId[];
}): CompositionProvenance[] {
  const selected = [...new Set(input.selected)]
    .filter((descriptorId) => input.graph.descriptorMap.has(descriptorId))
    .sort();
  const baseDescriptors = [...new Set(input.baseDescriptors ?? [])]
    .filter((descriptorId) => input.graph.descriptorMap.has(descriptorId))
    .sort();
  const descriptorIds = [...new Set(input.descriptorIds)]
    .filter((descriptorId) => input.graph.descriptorMap.has(descriptorId))
    .sort();

  return descriptorIds.map((descriptorId): CompositionProvenance => {
    const origins: CompositionProvenanceOrigin[] = [];

    if (selected.includes(descriptorId)) {
      origins.push({
        originType: 'selected',
        path: [],
      });
    }

    if (baseDescriptors.includes(descriptorId)) {
      origins.push({
        originType: 'base',
        path: [],
      });
    }

    for (const source of [...selected, ...baseDescriptors]) {
      if (source === descriptorId) continue;

      const path = explainPath({
        graph: input.graph,
        from: source,
        to: descriptorId,
        relationIds: input.relationIds,
      });

      if (!path.length) continue;

      origins.push({
        originType: createOriginType(path),
        path,
      });
    }

    return {
      descriptorId,
      origins: origins.sort(compareOrigins),
    };
  });
}
