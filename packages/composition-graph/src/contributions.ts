import type { Descriptor, DescriptorId, RelationDescriptor } from './types';

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
