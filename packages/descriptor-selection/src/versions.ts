import {
  readRelationTargets,
  type Descriptor,
  type RelationDescriptor,
} from '@lorion-org/composition-graph';
import { rcompare, satisfies, valid, validRange } from 'semver';

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
}): R {
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
    for (const [target, range] of Object.entries(descriptor.dependencies ?? {})) {
      if (typeof range !== 'string' || !range.trim() || validRange(range) === null) {
        throw new Error(
          `Descriptor "${id}@${version}" requires "${target}" with invalid version range ${JSON.stringify(range)}.`,
        );
      }
    }
    if (descriptor.disabled === true) continue;
    groups.set(id, [...(groups.get(id) ?? []), item]);
  }
  const candidates = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [, items] of candidates) {
    items.sort((a, b) => {
      const left = input.getDescriptor(a).version;
      const right = input.getDescriptor(b).version;
      return rcompare(left, right) || left.localeCompare(right);
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
  // effective edges, including incoming host relations. All provider-bearing ids
  // remain possible because the provider contract validates defaults globally.
  const possible = new Set([
    ...roots,
    ...descriptors
      .filter((entry) => entry.providesFor || entry.defaultFor)
      .map((entry) => entry.id),
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
  for (const id of possible) for (const target of outgoing.get(id) ?? []) possible.add(target);
  // Single-version and irrelevant ids need no search frame. Their source remains
  // available to catalog inspection, at the highest discovered version.
  const fixed = candidates
    .filter(([id, items]) => items.length === 1 || !possible.has(id))
    .map(([, items]) => items[0]!);
  const choices = candidates.filter(([id, items]) => items.length > 1 && possible.has(id));
  let firstFailure: unknown;
  const conflict = (target: string, sources: Descriptor[]): Error => {
    const requirements = sources
      .flatMap((source) =>
        source.dependencies?.[target] === undefined
          ? []
          : [`${source.id}@${source.version} requires ${target}@${source.dependencies[target]}`],
      )
      .sort();
    const available = (groups.get(target) ?? []).map((item) => input.getDescriptor(item).version);
    return new Error(
      `No compatible version for "${target}": ${requirements.join('; ')}. Available: ${available.join(', ') || 'none'}.`,
    );
  };

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
  const search = (index: number, chosen: T[]): R | undefined => {
    try {
      checkMandatory(chosen);
      if (index < choices.length) {
        for (const candidate of choices[index]![1]) {
          const result = search(index + 1, [...chosen, candidate]);
          if (result) return result;
        }
        return undefined;
      }
      const result = input.resolve([...fixed, ...chosen]);
      const resolved = result.items.map(input.getDescriptor);
      const byId = new Map(resolved.map((descriptor) => [descriptor.id, descriptor]));
      for (const descriptor of input.resolveDependencies ? resolved : []) {
        for (const [target, range] of Object.entries(descriptor.dependencies ?? {})) {
          const dependency = byId.get(target);
          if (!dependency || !satisfies(dependency.version, range))
            throw conflict(target, resolved);
        }
      }
      return result;
    } catch (error) {
      firstFailure ??= error;
      return undefined;
    }
  };
  const result = search(0, []);
  if (result) return result;
  throw firstFailure;
}
