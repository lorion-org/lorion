import { readDescriptorSelectionSeed, type DescriptorId } from '@lorion-org/composition-graph';
import { validRange } from 'semver';

export interface DescriptorSelectionSeed {
  baseDescriptors?: readonly DescriptorId[];
  defaultSelection?: readonly DescriptorId[];
  selected?: readonly DescriptorId[];
  selectionSeed?:
    | false
    | {
        argv?: string[];
        env?: Record<string, string | undefined>;
        key?: string;
        cliKeys?: string[];
        envKeys?: string[];
      };
}

export interface DescriptorVersionRequirement {
  id: DescriptorId;
  range: string;
  source: string;
}

export interface ResolvedDescriptorSeed {
  requested: readonly string[] | null;
  selected: readonly DescriptorId[];
  baseDescriptors: readonly DescriptorId[];
  requirements: readonly DescriptorVersionRequirement[];
}

function specs(value: readonly string[] | undefined, field: string): string[] {
  if (value === undefined) return [];
  const given: unknown = value;
  if (!Array.isArray(given)) {
    throw new TypeError(
      `Descriptor selection field "${field}" takes a list of ids, but got ${JSON.stringify(value)}. Pass a list.`,
    );
  }
  if (value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    throw new TypeError(
      `Descriptor selection field "${field}" contains an empty id: ${JSON.stringify(value)}.`,
    );
  }
  return [...new Set(value.map((entry) => entry.trim()))].sort();
}

// A comma separates requests containing spaces (comparator sets, unions, hyphens).
// Legacy whitespace-separated ids and simple id@range lists remain accepted.
function parseSeedValue(value: string | string[] | undefined): string[] {
  return [
    ...new Set(
      (Array.isArray(value) ? value : [value ?? '']).flatMap((entry) =>
        entry.split(',').flatMap((part) => {
          const text = part.trim();
          if (!text) return [];
          const separator = text.lastIndexOf('@');
          if (
            separator > 0 &&
            !/\s/.test(text.slice(0, separator)) &&
            validRange(text.slice(separator + 1)) !== null
          )
            return [text];
          return text.split(/\s+/);
        }),
      ),
    ),
  ].sort();
}

export function resolveRequestedSelection(seed: DescriptorSelectionSeed): string[] | null {
  const selected = specs(seed.selected, 'selected');
  if (selected.length) return selected;
  if (seed.selectionSeed === false) return null;
  const options = seed.selectionSeed ?? {};
  const named = parseSeedValue(
    readDescriptorSelectionSeed({
      argv: options.argv ?? process.argv,
      env: options.env ?? process.env,
      key: options.key ?? 'capability',
      ...(options.cliKeys ? { cliKeys: options.cliKeys } : {}),
      ...(options.envKeys ? { envKeys: options.envKeys } : {}),
    }),
  );
  return named.length ? named : null;
}

function requirement(spec: string, source: string): DescriptorVersionRequirement {
  const separator = spec.lastIndexOf('@');
  const id = separator > 0 ? spec.slice(0, separator) : spec;
  const range = separator > 0 ? spec.slice(separator + 1).trim() : '*';
  if (/\s/.test(id) || !range || validRange(range) === null) {
    throw new Error(
      `Invalid version request ${JSON.stringify(spec)} in ${source}. Use id or id@<SemVer range>; registry tags are not supported.`,
    );
  }
  return { id, range, source };
}

export function resolveDescriptorSeed(seed: DescriptorSelectionSeed): ResolvedDescriptorSeed {
  const defaults = specs(seed.defaultSelection, 'defaultSelection');
  const requested = resolveRequestedSelection(seed);
  const source = seed.selected?.length ? 'seed.selected' : 'seed.selectionSeed';
  const selected = (requested ?? defaults).map((spec) =>
    requirement(spec, requested ? source : 'seed.defaultSelection'),
  );
  const base = specs(seed.baseDescriptors, 'baseDescriptors').map((spec) =>
    requirement(spec, 'seed.baseDescriptors'),
  );
  return {
    requested,
    selected: [...new Set(selected.map((entry) => entry.id))].sort(),
    baseDescriptors: [...new Set(base.map((entry) => entry.id))].sort(),
    requirements: [...selected, ...base],
  };
}

export function resolveDescriptorSelection(seed: DescriptorSelectionSeed): DescriptorId[] {
  return [...resolveDescriptorSeed(seed).selected];
}
