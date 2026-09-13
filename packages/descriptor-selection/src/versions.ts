import {
  readRelationTargets,
  type Descriptor,
  type RelationDescriptor,
} from '@lorion-org/composition-graph';
import { rcompare, satisfies, valid, validRange } from 'semver';
import type { DescriptorVersionRequirement } from './seed';

export interface DescriptorVersionSelection {
  id: string;
  version: string;
  source?: string;
  requirements: readonly DescriptorVersionRequirement[];
}

// Version candidates keep their host-owned source. Only one candidate per logical
// id enters the provider resolver and the graph, whose identities remain ids.
export function selectVersions<T, R extends { items: T[] }>(input: {
  items: readonly T[];
  getDescriptor: (item: T) => Descriptor;
  getSource?: (item: T) => string;
  resolve: (items: T[]) => R;
  resolveDependencies: boolean;
  roots: readonly string[];
  resolutionRelations: readonly RelationDescriptor[];
  requirements: readonly DescriptorVersionRequirement[];
  getSelectionGroupMembers?: (item: T) => readonly string[] | undefined;
}): R & { versions: DescriptorVersionSelection[] } {
  const groups = new Map<string, T[]>();
  const identities = new Map<string, string>();
  for (const item of input.items) {
    const descriptor = input.getDescriptor(item);
    const { id, version } = descriptor;
    if (
      typeof version !== 'string' ||
      !valid(version) ||
      version.startsWith('v') ||
      version !== version.trim()
    ) {
      throw new Error(`Descriptor "${id}" has invalid version ${JSON.stringify(version)}.`);
    }
    const identity = JSON.stringify([id, version]);
    const previous = identities.get(identity);
    if (identities.has(identity)) {
      throw new Error(
        `Duplicate descriptor id "${id}" at version "${version}" (${previous || 'first source'} and ${input.getSource?.(item) ?? descriptor.location ?? 'second source'}).`,
      );
    }
    identities.set(identity, input.getSource?.(item) ?? descriptor.location ?? 'first source');
    for (const [target, range] of Object.entries(
      input.resolveDependencies ? (descriptor.dependencies ?? {}) : {},
    )) {
      if (typeof range !== 'string' || validRange(range) === null) {
        throw new Error(
          `Descriptor "${id}@${version}" requires "${target}" with invalid version range ${JSON.stringify(range)}.`,
        );
      }
    }
    if (descriptor.disabled === true) continue;
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  const availableById = new Map(groups);
  const conflict = (target: string, sources: readonly Descriptor[]): Error => {
    const requirements = [
      ...input.requirements
        .filter((entry) => entry.id === target)
        .map((entry) => `${entry.source} requires ${target}@${entry.range}`),
      ...sources.flatMap((source) =>
        source.dependencies?.[target] === undefined
          ? []
          : [`${source.id}@${source.version} requires ${target}@${source.dependencies[target]}`],
      ),
    ].sort();
    const available = (availableById.get(target) ?? [])
      .map((item) => input.getDescriptor(item).version)
      .sort(rcompare);
    return new Error(
      `No compatible version for "${target}": ${requirements.join('; ') || 'stable version required'}. Available: ${available.join(', ') || 'none'}.`,
    );
  };
  for (const id of new Set(input.requirements.map((entry) => entry.id))) {
    const ranges = input.requirements.filter((entry) => entry.id === id);
    const matching = (groups.get(id) ?? []).filter((item) =>
      ranges.every((entry) => satisfies(input.getDescriptor(item).version, entry.range)),
    );
    if (!matching.length) throw conflict(id, []);
    groups.set(id, matching);
  }
  const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  const candidates = [...groups.entries()].sort(([a], [b]) => compareText(a, b));
  for (const [, items] of candidates) {
    items.sort((a, b) => {
      const left = input.getDescriptor(a).version;
      const right = input.getDescriptor(b).version;
      return rcompare(left, right) || compareText(left, right);
    });
  }

  const descriptors = candidates.flatMap(([, items]) => items.map(input.getDescriptor));
  const providerIds = new Set(
    descriptors.filter((entry) => entry.providesFor).map((entry) => entry.id),
  );
  const roots = input.roots.length
    ? input.roots
    : candidates.filter(([id]) => !providerIds.has(id)).map(([id]) => id);
  // Only ids that can participate need version choices. Union every candidate's
  // effective edges, including incoming host relations. Defaults remain possible
  // because the provider contract validates them globally. Without explicit roots,
  // an id can become an implicit root when any candidate has no provider role.
  // Changing provider roles can also turn an ordinary dependency into a required
  // slot, even when the provider itself never enters the selected closure.
  const possible = new Set([
    ...roots,
    ...descriptors
      .filter((entry) => entry.defaultFor || (!input.roots.length && !entry.providesFor))
      .map((entry) => entry.id),
    ...candidates
      .filter(
        ([, items]) =>
          new Set(items.map((item) => JSON.stringify(input.getDescriptor(item).providesFor))).size >
          1,
      )
      .map(([id]) => id),
  ]);
  const outgoing = new Map<string, Set<string>>();
  for (const descriptor of descriptors) {
    for (const relation of input.resolutionRelations) {
      for (const target of readRelationTargets(descriptor, relation)) {
        const from = relation.direction === 'incoming' ? target : descriptor.id;
        const to = relation.direction === 'incoming' ? descriptor.id : target;
        const targets = outgoing.get(from) ?? new Set<string>();
        targets.add(to);
        outgoing.set(from, targets);
      }
    }
  }
  for (const [, items] of candidates) {
    for (const item of items) {
      const id = input.getDescriptor(item).id;
      const targets = outgoing.get(id) ?? new Set<string>();
      for (const member of input.getSelectionGroupMembers?.(item) ?? []) targets.add(member);
      outgoing.set(id, targets);
    }
  }
  for (const id of possible) for (const target of outgoing.get(id) ?? []) possible.add(target);
  // Single-version and irrelevant ids need no search frame. Their source remains
  // available to catalog inspection, at the highest discovered version.
  const fixed = candidates
    .filter(([id, items]) => items.length === 1 || !possible.has(id))
    .map(([, items]) => items[0]!);
  const choices = candidates.filter(([id, items]) => items.length > 1 && possible.has(id));
  let firstFailure: unknown;
  const requirementsFor = (
    id: string,
    resolved: readonly Descriptor[],
  ): DescriptorVersionRequirement[] => {
    const requirements = [
      ...input.requirements.filter((entry) => entry.id === id),
      ...(input.resolveDependencies
        ? resolved.flatMap((descriptor) =>
            descriptor.dependencies?.[id] === undefined
              ? []
              : [
                  {
                    id,
                    range: descriptor.dependencies[id],
                    source: `${descriptor.id}@${descriptor.version}`,
                  },
                ],
          )
        : []),
    ];
    return requirements.length ? requirements : [{ id, range: '*', source: 'implicit selection' }];
  };
  const finish = (result: R): R & { versions: DescriptorVersionSelection[] } => {
    const resolved = result.items.map(input.getDescriptor);
    // Validate effective dependency targets as well as selected roots. Provider
    // rewriting has already removed only the losing choices and their constraints.
    const byId = new Map(resolved.map((descriptor) => [descriptor.id, descriptor]));
    for (const descriptor of input.resolveDependencies ? resolved : []) {
      for (const target of Object.keys(descriptor.dependencies ?? {})) {
        if (!byId.has(target)) throw conflict(target, resolved);
      }
    }
    const versions = result.items.map((item) => {
      const descriptor = input.getDescriptor(item);
      const requirements = requirementsFor(descriptor.id, resolved);
      if (!requirements.every((entry) => satisfies(descriptor.version, entry.range)))
        throw conflict(descriptor.id, input.resolveDependencies ? resolved : []);
      const source = input.getSource?.(item) ?? descriptor.location;
      return {
        id: descriptor.id,
        version: descriptor.version,
        ...(source !== undefined ? { source } : {}),
        requirements,
      };
    });
    return { ...result, versions };
  };

  // When only versions and host metadata vary, provider precedence and the active
  // edges are fixed. Resolve those edges once, then choose compatible versions
  // independently. Include host relations so version-based edges still use DFS.
  const topology = (item: T): string => {
    const descriptor = input.getDescriptor(item);
    return JSON.stringify([
      descriptor.dependencies,
      descriptor.providesFor,
      descriptor.defaultFor,
      input.getSelectionGroupMembers?.(item),
      input.resolutionRelations.map((relation) => readRelationTargets(descriptor, relation)),
    ]);
  };
  if (
    input.resolveDependencies &&
    choices.length > 0 &&
    candidates.every(([, items]) => items.every((item) => topology(item) === topology(items[0]!)))
  ) {
    const representative = input.resolve(candidates.map(([, items]) => items[0]!));
    const resolved = representative.items.map(input.getDescriptor);
    const selected = new Map(candidates.map(([id, items]) => [id, items[0]!]));
    for (const descriptor of resolved) {
      const requirements = requirementsFor(descriptor.id, resolved);
      const match = groups
        .get(descriptor.id)
        ?.find((item) =>
          requirements.every((entry) => satisfies(input.getDescriptor(item).version, entry.range)),
        );
      if (!match) throw conflict(descriptor.id, resolved);
      selected.set(descriptor.id, match);
    }
    return finish(input.resolve([...selected.values()]));
  }

  // Propagate only mandatory ordinary dependencies. Provider edges can be removed
  // by precedence, so their constraints are checked against the final composition.
  // An undecided version activates only dependencies shared by all its candidates.
  const checkMandatory = (chosen: T[]): void => {
    if (!input.resolveDependencies) return;
    const assigned = new Map(
      [...fixed, ...chosen].map((item) => [input.getDescriptor(item).id, item]),
    );
    const possible = (id: string): Descriptor[] =>
      (assigned.has(id) ? [assigned.get(id)!] : (groups.get(id) ?? [])).map(input.getDescriptor);
    const mandatory = new Set(roots);
    for (const id of mandatory) {
      const options = possible(id);
      for (const target of Object.keys(options[0]?.dependencies ?? {})) {
        if (
          !providerIds.has(target) &&
          options.every((option) => Object.hasOwn(option.dependencies ?? {}, target))
        )
          mandatory.add(target);
      }
    }
    const sources = [...mandatory].flatMap((id) =>
      assigned.has(id) ? [input.getDescriptor(assigned.get(id)!)] : [],
    );
    const requirements = new Map<string, string[]>();
    for (const source of sources) {
      for (const [target, range] of Object.entries(source.dependencies ?? {})) {
        if (providerIds.has(target)) continue;
        requirements.set(target, [...(requirements.get(target) ?? []), range]);
      }
    }
    for (const [target, ranges] of requirements) {
      if (
        !possible(target).some((option) =>
          ranges.every((range) => satisfies(option.version, range)),
        )
      )
        throw conflict(target, sources);
    }
  };
  const search = (
    index: number,
    chosen: T[],
  ): (R & { versions: DescriptorVersionSelection[] }) | undefined => {
    try {
      checkMandatory(chosen);
      if (index < choices.length) {
        for (const candidate of choices[index]![1]) {
          const result = search(index + 1, [...chosen, candidate]);
          if (result) return result;
        }
        return undefined;
      }
      return finish(input.resolve([...fixed, ...chosen]));
    } catch (error) {
      firstFailure ??= error;
      return undefined;
    }
  };
  const result = search(0, []);
  if (result) return result;
  throw firstFailure;
}
