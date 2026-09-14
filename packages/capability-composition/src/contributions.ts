import { resolveVersionedContributions, type Descriptor } from '@lorion-org/composition-graph';
import {
  ContributionError,
  type ContributionPlan,
  type ContributionPlanEdge,
} from '@lorion-org/contributions';

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function projectContributionPlan(input: {
  catalog: readonly Descriptor[];
  selected: readonly Descriptor[];
}): ContributionPlan {
  const relations = resolveVersionedContributions(input.catalog);
  const catalog = new Set(input.catalog.map(({ id, version }) => JSON.stringify([id, version])));
  const selected = new Map<string, string>();
  for (const candidate of input.selected) {
    if (
      !candidate ||
      typeof candidate.id !== 'string' ||
      !candidate.id ||
      typeof candidate.version !== 'string' ||
      !candidate.version
    )
      throw new ContributionError('INVALID_PLAN');
    const { id, version } = candidate;
    if (
      !catalog.has(JSON.stringify([id, version])) ||
      (selected.has(id) && selected.get(id) !== version)
    ) {
      throw new ContributionError('INVALID_PLAN', { source: { id, version } });
    }
    selected.set(id, version);
  }
  const identities = [...selected]
    .map(([id, version]) => ({ id, version }))
    .sort((a, b) => compare(a.id, b.id) || compare(a.version, b.version));
  const points = identities.flatMap((owner) =>
    [...new Set(relations.points(owner))]
      .sort(compare)
      .map((point) => ({ owner: owner.id, ownerVersion: owner.version, point })),
  );
  const edges = new Map<string, ContributionPlanEdge>();
  for (const edge of relations.edges) {
    if (selected.get(edge.from) !== edge.fromVersion) continue;
    const source = { id: edge.from, version: edge.fromVersion };
    const target = { owner: edge.to, point: edge.point };
    const key = JSON.stringify([edge.from, edge.to, edge.point]);
    const version = selected.get(edge.to);
    if (version === undefined) edges.set(key, { source, target, active: false });
    else if (version === edge.toVersion)
      edges.set(key, { source, target, active: true, ownerVersion: version });
  }
  return {
    selected: identities,
    points,
    edges: [...edges.values()].sort(
      (a, b) =>
        compare(a.source.id, b.source.id) ||
        compare(a.source.version, b.source.version) ||
        compare(a.target.owner, b.target.owner) ||
        compare(a.target.point, b.target.point),
    ),
  };
}
