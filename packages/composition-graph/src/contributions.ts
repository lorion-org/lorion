import type { Descriptor, DescriptorId, RelationDescriptor } from './types';
import { compareBuild, satisfies, valid, validRange } from 'semver';

// The declared contribution relation: a descriptor offers named points, and other
// descriptors declare which of those points they fill. It is the non-exclusive
// counterpart to `providesFor`, which fills an exclusive provider slot: several
// descriptors may fill the same point, and filling one replaces nothing.
//
// The relation is declared data, read and validated in one place. Resolution does
// not walk it: a contribution states where a descriptor's output lands, not what
// has to be in the composition for it to work, and a descriptor that needs its
// point owner present declares that as a dependency like any other.

// The field through which a descriptor declares what it contributes elsewhere: a
// map from the owning descriptor to the point or points it fills there.
export const CONTRIBUTION_FIELD = 'contributesTo';

// The field through which a descriptor declares the points others may fill. A
// contribution may only name a point its owner declares, so a point name is owned
// vocabulary and not a string the contributing side invents.
export const CONTRIBUTION_POINT_FIELD = 'contributionPoints';

export interface ContributionEdge {
  // The descriptor declaring the contribution.
  from: DescriptorId;
  // The descriptor that owns the point and receives it.
  to: DescriptorId;
  // The point being filled, as its owner names it.
  point: string;
}

export interface ContributionRelations {
  edges: readonly ContributionEdge[];
  // The points a descriptor declares, whether or not anything fills them.
  points: (id: DescriptorId) => readonly string[];
  // What this descriptor contributes elsewhere.
  fills: (id: DescriptorId) => readonly ContributionEdge[];
  // What other descriptors contribute into this one.
  receives: (id: DescriptorId) => readonly ContributionEdge[];
}

export interface VersionedContributionEdge extends ContributionEdge {
  fromVersion: string;
  toVersion: string;
}

export interface VersionedContributionRelations {
  // Every valid edge between version candidates. This is catalog validation, not
  // the active projection of one composition.
  edges: readonly VersionedContributionEdge[];
  points: (descriptor: Pick<Descriptor, 'id' | 'version'>) => readonly string[];
  // Project the catalog onto the exact descriptor versions a composition selected.
  // A known owner absent from that selection makes its contribution inactive.
  project: (selected: readonly Descriptor[]) => ContributionRelations;
}

export interface ContributionRelationOptions {
  // The field names, for a host whose descriptors spell the relation differently.
  field?: string;
  pointField?: string;
}

// A ready-made relation descriptor for the contribution edge, so a host registers it
// in the graph in one line. Registered for inspection only: the edge is readable and
// walkable, and what the composition resolves stays what dependencies and providers
// resolve.
export function contributionRelationDescriptor(
  options: ContributionRelationOptions & { id?: string } = {},
): RelationDescriptor {
  return {
    id: options.id ?? 'contributions',
    field: options.field ?? CONTRIBUTION_FIELD,
    targetMode: 'keys',
    roles: ['inspection'],
  };
}

function readPoints(descriptor: Descriptor, pointField: string): string[] {
  const declared = descriptor[pointField];
  if (declared === undefined) return [];
  if (
    !Array.isArray(declared) ||
    declared.some((entry) => typeof entry !== 'string' || entry.length === 0)
  ) {
    throw new Error(
      `Descriptor "${descriptor.id}": "${pointField}" must list non-empty point names.`,
    );
  }
  return declared as string[];
}

function readContributions(
  descriptor: Descriptor,
  pointsOf: ReadonlyMap<DescriptorId, string[]>,
  options: Required<ContributionRelationOptions>,
): ContributionEdge[] {
  const declared = descriptor[options.field];
  if (declared === undefined) return [];
  if (!declared || typeof declared !== 'object' || Array.isArray(declared)) {
    throw new Error(
      `Descriptor "${descriptor.id}": "${options.field}" must map an owning descriptor to the point or points filled there.`,
    );
  }

  return Object.entries(declared as Record<string, unknown>).flatMap(([to, value]) => {
    const points = typeof value === 'string' ? [value] : value;
    if (
      !Array.isArray(points) ||
      !points.length ||
      points.some((point) => typeof point !== 'string' || !point.length)
    ) {
      throw new Error(
        `Descriptor "${descriptor.id}": "${options.field}.${to}" must name one contribution point or a list of them.`,
      );
    }
    if (to === descriptor.id) {
      throw new Error(
        `Descriptor "${descriptor.id}" declares a contribution to itself; a contribution names a foreign owner.`,
      );
    }

    const owned = pointsOf.get(to);
    if (!owned) {
      throw new Error(
        `Descriptor "${descriptor.id}" contributes to "${to}", which is not a known descriptor of this composition.`,
      );
    }

    return (points as string[]).map((point) => {
      if (!owned.includes(point)) {
        throw new Error(
          `Descriptor "${descriptor.id}" contributes "${point}" to "${to}", which declares ${
            owned.length ? owned.map((entry) => `"${entry}"`).join(', ') : 'no contribution point'
          }.`,
        );
      }
      return { from: descriptor.id, to, point };
    });
  });
}

// The declared contribution relation of a descriptor set, in both directions. A
// contribution to an unknown descriptor, to a point its owner does not declare, or to
// the contributor itself aborts here, where the declaring descriptor is still named:
// an unresolvable contribution otherwise points nowhere and is silently never filled.
export function resolveContributions(
  descriptors: readonly Descriptor[],
  options: ContributionRelationOptions = {},
): ContributionRelations {
  const resolved = {
    field: options.field ?? CONTRIBUTION_FIELD,
    pointField: options.pointField ?? CONTRIBUTION_POINT_FIELD,
  };
  const pointsOf = new Map(
    descriptors.map((descriptor) => [descriptor.id, readPoints(descriptor, resolved.pointField)]),
  );
  const edges = descriptors.flatMap((descriptor) =>
    readContributions(descriptor, pointsOf, resolved),
  );

  const outgoing = new Map<DescriptorId, ContributionEdge[]>();
  const incoming = new Map<DescriptorId, ContributionEdge[]>();
  for (const edge of edges) {
    outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
    incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
  }

  return {
    edges,
    points: (id) => pointsOf.get(id) ?? [],
    fills: (id) => outgoing.get(id) ?? [],
    receives: (id) => incoming.get(id) ?? [],
  };
}

function descriptorIdentity(descriptor: Pick<Descriptor, 'id' | 'version'>): string {
  return JSON.stringify([descriptor.id, descriptor.version]);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

// Validate contribution declarations across a versioned catalog and retain the
// version identity on every possible edge. When a contributor constrains its owner
// through `dependencies`, only matching owner versions are its contract. Without a
// constraint the point must exist in every owner version, so discovery order can
// never choose the vocabulary accidentally.
export function resolveVersionedContributions(
  descriptors: readonly Descriptor[],
  options: ContributionRelationOptions = {},
): VersionedContributionRelations {
  const resolved = {
    field: options.field ?? CONTRIBUTION_FIELD,
    pointField: options.pointField ?? CONTRIBUTION_POINT_FIELD,
  };
  const byIdentity = new Map<string, Descriptor>();
  const byId = new Map<DescriptorId, Descriptor[]>();
  const pointsByIdentity = new Map<string, string[]>();
  for (const descriptor of descriptors) {
    if (
      !valid(descriptor.version) ||
      descriptor.version.startsWith('v') ||
      descriptor.version !== descriptor.version.trim()
    ) {
      throw new Error(
        `Descriptor "${descriptor.id}" has invalid version ${JSON.stringify(descriptor.version)}.`,
      );
    }
    const identity = descriptorIdentity(descriptor);
    if (byIdentity.has(identity)) {
      throw new Error(
        `Duplicate descriptor identity "${descriptor.id}@${descriptor.version}" in contribution catalog.`,
      );
    }
    byIdentity.set(identity, descriptor);
    byId.set(descriptor.id, [...(byId.get(descriptor.id) ?? []), descriptor]);
    pointsByIdentity.set(identity, readPoints(descriptor, resolved.pointField));
  }

  const edges: VersionedContributionEdge[] = [];
  for (const descriptor of descriptors) {
    const declared = descriptor[resolved.field];
    if (declared === undefined) continue;
    if (!declared || typeof declared !== 'object' || Array.isArray(declared)) {
      throw new Error(
        `Descriptor "${descriptor.id}@${descriptor.version}": "${resolved.field}" must map an owning descriptor to the point or points filled there.`,
      );
    }

    for (const [to, value] of Object.entries(declared as Record<string, unknown>)) {
      const requestedPoints = typeof value === 'string' ? [value] : value;
      if (
        !Array.isArray(requestedPoints) ||
        !requestedPoints.length ||
        requestedPoints.some((point) => typeof point !== 'string' || !point.length)
      ) {
        throw new Error(
          `Descriptor "${descriptor.id}@${descriptor.version}": "${resolved.field}.${to}" must name one contribution point or a list of them.`,
        );
      }
      if (to === descriptor.id) {
        throw new Error(
          `Descriptor "${descriptor.id}@${descriptor.version}" declares a contribution to itself; a contribution names a foreign owner.`,
        );
      }

      const owners = byId.get(to) ?? [];
      if (!owners.length) {
        throw new Error(
          `Descriptor "${descriptor.id}@${descriptor.version}" contributes to "${to}", which is not a known descriptor of this catalog.`,
        );
      }
      const ownerRange = descriptor.dependencies?.[to];
      if (ownerRange !== undefined && validRange(ownerRange) === null) {
        throw new Error(
          `Descriptor "${descriptor.id}@${descriptor.version}" has invalid dependency range ${JSON.stringify(ownerRange)} for contribution owner "${to}".`,
        );
      }
      const compatibleOwners = ownerRange
        ? owners.filter((owner) => satisfies(owner.version, ownerRange))
        : owners;
      if (!compatibleOwners.length) {
        throw new Error(
          `Descriptor "${descriptor.id}@${descriptor.version}" contributes to "${to}", but no owner version satisfies "${ownerRange}".`,
        );
      }

      for (const owner of compatibleOwners) {
        const owned = pointsByIdentity.get(descriptorIdentity(owner)) ?? [];
        for (const point of requestedPoints as string[]) {
          if (!owned.includes(point)) {
            throw new Error(
              `Descriptor "${descriptor.id}@${descriptor.version}" contributes "${point}" to "${owner.id}@${owner.version}", which declares ${
                owned.length
                  ? owned.map((entry) => `"${entry}"`).join(', ')
                  : 'no contribution point'
              }.`,
            );
          }
          edges.push({
            from: descriptor.id,
            fromVersion: descriptor.version,
            to: owner.id,
            toVersion: owner.version,
            point,
          });
        }
      }
    }
  }

  const sortedEdges = edges.sort(
    (left, right) =>
      compareText(left.from, right.from) ||
      compareBuild(left.fromVersion, right.fromVersion) ||
      compareText(left.fromVersion, right.fromVersion) ||
      compareText(left.to, right.to) ||
      compareBuild(left.toVersion, right.toVersion) ||
      compareText(left.toVersion, right.toVersion) ||
      compareText(left.point, right.point),
  );

  return {
    edges: sortedEdges,
    points: (descriptor) => pointsByIdentity.get(descriptorIdentity(descriptor)) ?? [],
    project: (selected) => {
      const selectedVersions = new Map<DescriptorId, string>();
      for (const descriptor of selected) {
        if (!byIdentity.has(descriptorIdentity(descriptor))) {
          throw new Error(
            `Contribution projection selected unknown descriptor "${descriptor.id}@${descriptor.version}".`,
          );
        }
        const existing = selectedVersions.get(descriptor.id);
        if (existing !== undefined && existing !== descriptor.version) {
          throw new Error(
            `Contribution projection selected multiple versions of "${descriptor.id}": ${existing}, ${descriptor.version}.`,
          );
        }
        selectedVersions.set(descriptor.id, descriptor.version);
      }
      const selectedIdentities = new Set(selected.map(descriptorIdentity));
      const activeEdges = sortedEdges
        .filter(
          (edge) =>
            selectedIdentities.has(JSON.stringify([edge.from, edge.fromVersion])) &&
            selectedIdentities.has(JSON.stringify([edge.to, edge.toVersion])),
        )
        .map(({ from, to, point }) => ({ from, to, point }));
      const activePoints = new Map(
        selected.map((descriptor) => [
          descriptor.id,
          pointsByIdentity.get(descriptorIdentity(descriptor)) ?? [],
        ]),
      );
      const outgoing = new Map<DescriptorId, ContributionEdge[]>();
      const incoming = new Map<DescriptorId, ContributionEdge[]>();
      for (const edge of activeEdges) {
        outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
        incoming.set(edge.to, [...(incoming.get(edge.to) ?? []), edge]);
      }
      return {
        edges: activeEdges,
        points: (id) => activePoints.get(id) ?? [],
        fills: (id) => outgoing.get(id) ?? [],
        receives: (id) => incoming.get(id) ?? [],
      };
    },
  };
}
