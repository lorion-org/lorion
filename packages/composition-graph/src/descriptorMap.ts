import type { Descriptor, DescriptorId, DescriptorMap } from './types';

export type DescriptorSelectionSeedInput = {
  argv?: string[];
  cliKeys?: string[];
  defaultValue?: DescriptorId[] | string;
  env?: Record<string, string | undefined>;
  envKeys?: string[];
  key?: string;
};

// A composition addresses every descriptor by its id, so two descriptors sharing
// one id cannot both take part: the second would replace the first and whatever the
// first contributed would vanish without a trace. Reporting the id is the only
// outcome that lets the host see which two declarations collided.
export function buildDescriptorMap(descriptors: Iterable<Descriptor>): DescriptorMap {
  const descriptorMap: DescriptorMap = new Map();
  const duplicates = new Set<DescriptorId>();

  for (const descriptor of descriptors) {
    if (descriptorMap.has(descriptor.id)) duplicates.add(descriptor.id);
    descriptorMap.set(descriptor.id, descriptor);
  }

  if (duplicates.size) {
    throw new Error(
      `Descriptor ids must be unique within a composition, but found duplicates (${[...duplicates].sort().join(', ')}).`,
    );
  }

  return descriptorMap;
}

export function parseDescriptorIds(input?: unknown): DescriptorId[] {
  if (typeof input === 'string') {
    return Array.from(
      new Set(
        input
          .split(/[,\s]+/)
          .map((item) => item.trim())
          .filter(Boolean),
      ),
    ).sort();
  }

  if (!Array.isArray(input)) return [];

  const items = input.flatMap((item) => (typeof item === 'string' ? parseDescriptorIds(item) : []));

  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).sort();
}

function readCliValue(argv: string[], key: string): string | undefined {
  const arg = argv.find((entry) => entry === key || entry.startsWith(`${key}=`));

  if (!arg) return undefined;
  if (arg === key) {
    const value = argv[argv.indexOf(arg) + 1];
    return value?.startsWith('-') ? undefined : value;
  }

  return arg.slice(`${key}=`.length);
}

function firstNonEmptyValue(
  values: Array<string | string[] | undefined>,
): string | string[] | undefined {
  return values.find((value) => {
    if (typeof value === 'string') return value.trim().length > 0;
    return Array.isArray(value) && value.some((entry) => typeof entry === 'string' && entry.trim());
  });
}

function pluralizeSelectionKeySegment(value: string): string {
  if (value.endsWith('s')) return value;
  if (value.endsWith('y')) return `${value.slice(0, -1)}ies`;
  return `${value}s`;
}

function normalizeSelectionKey(value: string): string {
  const segments = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[_\s]+/g, '-')
    .toLowerCase()
    .split('-')
    .filter(Boolean);

  if (!segments.length) return '';

  const lastSegment = segments[segments.length - 1] as string;
  segments[segments.length - 1] = pluralizeSelectionKeySegment(lastSegment);

  return segments.join('-');
}

function toEnvKey(value: string): string {
  return value.replaceAll('-', '_').toUpperCase();
}

function resolveCliKeys(input: DescriptorSelectionSeedInput): string[] {
  // A `key` is a logical name and gets the flag prefix. An explicit `cliKeys` entry
  // is matched as written and, when it carries no leading dash, also in its prefixed
  // form: `['features']` is the shape a host reaches for first, and silently
  // matching nothing is the worse answer. The prefixed spelling is tried first, so a
  // positional argument that happens to equal the bare key cannot outrank the flag
  // and swallow the token after it.
  if (input.cliKeys) {
    return input.cliKeys.flatMap((key) => (key.startsWith('-') ? [key] : [`--${key}`, key]));
  }

  const key = input.key ? normalizeSelectionKey(input.key) : '';
  return key ? [`--${key}`] : [];
}

function resolveEnvKeys(input: DescriptorSelectionSeedInput): string[] {
  if (input.envKeys) return input.envKeys;

  const key = input.key ? normalizeSelectionKey(input.key) : '';
  return key ? [`npm_config_${key.replaceAll('-', '_')}`, `LORION_${toEnvKey(key)}`] : [];
}

export function resolveDescriptorSelectionSeed(
  input: DescriptorSelectionSeedInput = {},
): DescriptorId[] {
  return parseDescriptorIds(
    firstNonEmptyValue([
      ...resolveCliKeys(input).map((key) => readCliValue(input.argv ?? [], key)),
      ...resolveEnvKeys(input).map((key) => input.env?.[key]),
      input.defaultValue,
    ]),
  );
}

export function assertKnownDescriptorIds(
  descriptorMap: DescriptorMap,
  ids: DescriptorId[],
  label: string,
): void {
  const missing: DescriptorId[] = [...new Set(ids)]
    .filter((id) => id && !descriptorMap.has(id))
    .sort();

  if (!missing.length) return;

  throw new Error(`Unknown ${label}: ${missing.join(', ')}`);
}
