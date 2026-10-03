import { parse, rcompare, validRange } from 'semver';
import type { Descriptor } from '@lorion-org/composition-graph';
import type { DescriptorVersionRequirement } from './seed';

export interface DescriptorVersionCandidate {
  readonly id: string;
  readonly version: string;
  readonly prerelease: readonly (string | number)[];
}

export type DescriptorVersionSelector = (candidate: DescriptorVersionCandidate) => boolean;

export interface DescriptorNamedVersionRequirement {
  id: string;
  selector: string;
  source: string;
}

export function readVersionSelectors(
  value: Readonly<Record<string, DescriptorVersionSelector>> | undefined,
): ReadonlyMap<string, DescriptorVersionSelector> {
  if (value === undefined) return new Map();
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new TypeError('versionSelectors must be a record of synchronous predicates.');
  const result = new Map<string, DescriptorVersionSelector>();
  for (const [name, selector] of Object.entries(value).sort(([a], [b]) => compare(a, b))) {
    if (!name || /[\s,@]/.test(name) || validRange(name) !== null)
      throw new TypeError(
        `Invalid version selector name ${JSON.stringify(name)}: use a non-SemVer token without whitespace, commas or @.`,
      );
    if (typeof selector !== 'function')
      throw new TypeError(
        `Version selector ${JSON.stringify(name)} must be a synchronous predicate.`,
      );
    result.set(name, selector);
  }
  return result;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function resolveNamedVersionRequirements(input: {
  named: readonly DescriptorNamedVersionRequirement[];
  selectors?: Readonly<Record<string, DescriptorVersionSelector>>;
  descriptors: readonly Descriptor[];
}): DescriptorVersionRequirement[] {
  const selectors = readVersionSelectors(input.selectors);
  if (!input.named.length) return [];
  const candidates = input.descriptors
    .filter((descriptor) => descriptor.disabled !== true)
    .sort(
      (a, b) =>
        compare(a.id, b.id) || rcompare(a.version, b.version) || compare(a.version, b.version),
    );
  const eligible = new Map<string, readonly string[]>();
  return input.named.map(({ id, selector: name, source }) => {
    const key = JSON.stringify([id, name]);
    let versions = eligible.get(key);
    if (!versions) {
      const predicate = selectors.get(name);
      if (!predicate)
        throw new Error(
          `Unknown version selector ${JSON.stringify(name)} for ${JSON.stringify(id)}.`,
        );
      versions = candidates
        .filter((candidate) => {
          if (candidate.id !== id) return false;
          const prerelease = Object.freeze([...parse(candidate.version)!.prerelease]);
          let matches: unknown;
          try {
            matches = predicate(Object.freeze({ id, version: candidate.version, prerelease }));
          } catch (cause) {
            throw new Error(
              `Version selector ${JSON.stringify(name)} failed for ${id}@${candidate.version}.`,
              { cause },
            );
          }
          if (typeof matches !== 'boolean') {
            void Promise.resolve(matches).catch(() => {});
            throw new TypeError(
              `Version selector ${JSON.stringify(name)} must return a boolean synchronously.`,
            );
          }
          return matches;
        })
        .map(({ version }) => version);
      if (!versions.length) {
        const available = candidates
          .filter((candidate) => candidate.id === id)
          .map(({ version }) => version);
        throw new Error(
          `No enabled versions match selector ${JSON.stringify(name)} for ${JSON.stringify(id)}. Available: ${available.join(', ') || 'none'}.`,
        );
      }
      eligible.set(key, versions);
    }
    return { id, source, range: versions.join(' || '), selector: name, versions: [...versions] };
  });
}
