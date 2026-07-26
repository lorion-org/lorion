import {
  createCompositionSelection,
  createDescriptorCatalog,
  resolveDescriptorSelectionSeed,
  type CompositionPolicy,
  type Descriptor,
  type DescriptorCatalog,
  type DescriptorId,
  type RelationDescriptor,
} from '@lorion-org/composition-graph';
export type {
  ProviderSelectionMode,
  ProviderSelectionResolution,
} from '@lorion-org/provider-selection';
import {
  collectProviderDefaults,
  collectProviderPreferences,
  collectSelectedProviderPreferences,
  type ProviderSelectionResolution,
  resolveItemProviderSelection,
  resolveSelectedProviderRelationPreferences,
} from '@lorion-org/provider-selection';

// Provider-aware descriptor selection: given a set of items that each carry a
// descriptor and a selection seed, resolve the active subset — applying
// dependency resolution and one-provider-per-capability selection. Generic over
// the item type, so build-time bundlers, runtime hosts, and framework adapters
// share one selection brain instead of re-gluing the graph and provider layers.

// The relations that make provider resolution work: a capability's default
// provider (an incoming `defaultFor` edge) and its explicit provider preferences.
export const providerRelationDescriptors: RelationDescriptor[] = [
  { direction: 'incoming', field: 'defaultFor', id: 'defaultProviders' },
  { field: 'providerPreferences', id: 'providerPreferences', targetMode: 'values' },
];

// The relations walked when resolving, inspecting, and tracing provenance.
export const defaultResolutionRelations = [
  'dependencies',
  'defaultProviders',
  'providerPreferences',
] as const;

export function descriptorSelectionPolicy(
  policy?: Partial<CompositionPolicy>,
): Partial<CompositionPolicy> {
  return {
    ...policy,
    inspectionRelationIds: policy?.inspectionRelationIds ?? [...defaultResolutionRelations],
    provenanceRelationIds: policy?.provenanceRelationIds ?? [...defaultResolutionRelations],
    resolutionRelationIds: policy?.resolutionRelationIds ?? [...defaultResolutionRelations],
  };
}

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

// Normalises a descriptor id list, and reports the two mistakes that otherwise pass
// as data. A string reads as a list and is not: spreading `'shop'` yields four
// one-character ids that name nothing, and the host would then be told those ids
// are unknown rather than what it actually did wrong. An empty id names nothing
// either, and dropping it silently turns `selected: ['']` — the shape an unset
// environment variable produces — into a composition of nothing.
//
// Duplicates are removed and the result is sorted, so a host's own ordering never
// leaks into the composition and every caller sees one normalisation.
function toDescriptorIds(
  value: readonly DescriptorId[] | undefined,
  field: string,
): DescriptorId[] {
  if (value === undefined) return [];

  // Widened deliberately: the declared type already excludes a string, so this
  // guard exists for the untyped caller a published package always has.
  const given: unknown = value;
  if (typeof given === 'string') {
    throw new TypeError(
      `Descriptor selection field "${field}" takes a list of ids, but got the string "${given}". Pass ["${given}"].`,
    );
  }

  const ids = [...value];
  if (ids.some((id) => typeof id !== 'string' || !id.trim())) {
    throw new TypeError(
      `Descriptor selection field "${field}" contains an empty id: ${JSON.stringify(ids)}.`,
    );
  }

  return [...new Set(ids)].sort();
}

// The active selection ids from a seed: explicit `selected` wins; otherwise the
// CLI/env seed is parsed, falling back to `defaultSelection`. Base descriptors are
// resolved separately by the graph and are not part of this list.
export function resolveDescriptorSelection(seed: DescriptorSelectionSeed): DescriptorId[] {
  const selectedIds = toDescriptorIds(seed.selected, 'selected');
  const defaultIds = toDescriptorIds(seed.defaultSelection, 'defaultSelection');

  if (selectedIds.length) return selectedIds;
  if (seed.selectionSeed === false) return defaultIds;

  const options = seed.selectionSeed ?? {};
  const selected = resolveDescriptorSelectionSeed({
    argv: options.argv ?? process.argv,
    env: options.env ?? process.env,
    key: options.key ?? 'capability',
    ...(options.cliKeys ? { cliKeys: options.cliKeys } : {}),
    ...(options.envKeys ? { envKeys: options.envKeys } : {}),
  });

  return selected.length ? selected : defaultIds;
}

// A capability a descriptor provides for must be declared: some descriptor in the
// workspace carries that id. Without this a mistyped `providesFor` silently opens a
// second capability that nothing requires, the real one falls back to its default,
// and the composition quietly becomes a different product than the author asked for.
//
// Checked against every discovered descriptor, not the resolved subset, so a
// provider whose capability exists but takes no part in this composition is fine.
export function assertKnownProviderCapabilities(input: {
  declared: readonly Descriptor[];
  providers: readonly Descriptor[];
}): void {
  const declaredIds = new Set(input.declared.map((descriptor) => descriptor.id));
  const unknown = new Map<string, string[]>();

  for (const descriptor of input.providers) {
    const capabilities = [descriptor.providesFor, descriptor.defaultFor]
      .flatMap((value) => (Array.isArray(value) ? value : [value]))
      .filter((value): value is DescriptorId => typeof value === 'string' && value.length > 0);

    for (const capabilityId of new Set(capabilities)) {
      if (declaredIds.has(capabilityId)) continue;
      unknown.set(capabilityId, [...(unknown.get(capabilityId) ?? []), descriptor.id]);
    }
  }

  if (!unknown.size) return;

  const reported = [...unknown.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([capabilityId, providers]) => `${capabilityId}: ${[...providers].sort().join(', ')}`);

  throw new Error(
    `Descriptors provide for capabilities that no descriptor declares (${reported.join('; ')}). Declare the capability, for example as \`{ "id": "<capability>", "version": "0.0.0" }\`.`,
  );
}

// A capability may declare exactly one default provider. Two descriptors both
// claiming `defaultFor` the same capability is a misconfiguration: without an
// explicit provider selection nothing disambiguates them and both would resolve.
export function assertSingleDefaultProvider(descriptors: readonly Descriptor[]): void {
  const providersByCapability = new Map<string, string[]>();

  for (const descriptor of descriptors) {
    const { defaultFor } = descriptor;
    if (!defaultFor) continue;
    for (const capabilityId of Array.isArray(defaultFor) ? defaultFor : [defaultFor]) {
      const providers = providersByCapability.get(capabilityId) ?? [];
      providers.push(descriptor.id);
      providersByCapability.set(capabilityId, providers);
    }
  }

  const conflicts = [...providersByCapability.entries()]
    .filter(([, providers]) => providers.length > 1)
    .map(([capabilityId, providers]) => `${capabilityId}: ${[...providers].sort().join(', ')}`);

  if (conflicts.length) {
    throw new Error(
      `Descriptor selection requires exactly one defaultFor provider per capability, but found multiple (${conflicts.join('; ')}).`,
    );
  }
}

// An explicit selection may name at most one provider per capability. Naming two
// is a misconfiguration with no silent resolution: both are seeded, so both would
// resolve and the capability would be served twice. Symmetric to
// `assertSingleDefaultProvider`, which guards the same invariant for defaults.
export function assertSingleSelectedProvider(
  descriptors: readonly Descriptor[],
  selected: readonly DescriptorId[],
): void {
  const selectedIds = new Set(selected);
  const providersByCapability = new Map<string, string[]>();

  for (const descriptor of descriptors) {
    if (!selectedIds.has(descriptor.id)) continue;
    const { providesFor } = descriptor;
    if (!providesFor) continue;
    for (const capabilityId of Array.isArray(providesFor) ? providesFor : [providesFor]) {
      const providers = providersByCapability.get(capabilityId) ?? [];
      providers.push(descriptor.id);
      providersByCapability.set(capabilityId, providers);
    }
  }

  const conflicts = [...providersByCapability.entries()]
    .filter(([, providers]) => providers.length > 1)
    .map(([capabilityId, providers]) => `${capabilityId}: ${[...providers].sort().join(', ')}`);

  if (conflicts.length) {
    throw new Error(
      `Descriptor selection allows at most one selected provider per capability, but found multiple (${conflicts.join('; ')}).`,
    );
  }
}

export interface ProviderSelectionInput<T> {
  items: readonly T[];
  selected: readonly DescriptorId[];
  getDescriptor: (item: T) => Descriptor;
  withDescriptor: (item: T, descriptor: Descriptor) => T;
}

// Apply one-provider-per-capability selection: for each explicitly selected
// provider, drop the competing `defaultFor`/`providerPreferences` from the other
// items so the graph resolves exactly one provider. Items are returned untouched
// when no provider is selected.
export function applyProviderSelection<T>(input: ProviderSelectionInput<T>): T[] {
  const { items, selected, getDescriptor, withDescriptor } = input;

  const selectedProviders = collectSelectedProviderPreferences({
    items,
    getCapabilityId: (item) => getDescriptor(item).providesFor,
    getProviderId: (item) => getDescriptor(item).id,
    selectedProviderIds: selected,
  });

  if (!Object.keys(selectedProviders).length) return [...items];

  return items.map((item) => {
    const descriptor: Descriptor = { ...getDescriptor(item) };
    const preferences = resolveSelectedProviderRelationPreferences({
      providerId: descriptor.id,
      defaultFor: descriptor.defaultFor,
      providerPreferences: descriptor.providerPreferences,
      selectedProviders,
    });
    delete descriptor.defaultFor;
    delete descriptor.providerPreferences;
    return withDescriptor(item, { ...descriptor, ...preferences });
  });
}

export interface DescriptorSelectionInput<T> {
  items: readonly T[];
  // Read the descriptor an item carries.
  getDescriptor: (item: T) => Descriptor;
  // Return a copy of the item with a rewritten descriptor (provider preferences
  // applied). Keeps the item type opaque to this package.
  withDescriptor: (item: T, descriptor: Descriptor) => T;
  seed: DescriptorSelectionSeed;
  // Extra relations to resolve alongside the provider relations (for example a
  // host's own dependency or grouping edges).
  relationDescriptors?: readonly RelationDescriptor[];
  policy?: Partial<CompositionPolicy>;
}

// Which provider won each contested capability, for a set of items and the ids a
// host selected. Reports the winner, its `mode` (configured, selected, fallback or
// first), the candidates and the providers that lost — so a host can show or check
// the outcome instead of re-deriving it from the resolved set.
export function describeProviderSelection<T>(input: {
  items: readonly T[];
  selected: readonly DescriptorId[];
  getDescriptor: (item: T) => Descriptor;
}): ProviderSelectionResolution {
  const { items, selected, getDescriptor } = input;
  const getCapabilityId = (item: T): Descriptor['providesFor'] => getDescriptor(item).providesFor;
  const getProviderId = (item: T): DescriptorId => getDescriptor(item).id;

  return resolveItemProviderSelection({
    items,
    getCapabilityId,
    getProviderId,
    fallbackProviders: {
      ...collectProviderDefaults({
        items,
        getDefaultFor: (item) => getDescriptor(item).defaultFor,
        getProviderId,
      }),
      ...collectProviderPreferences({
        items,
        getProviderPreferences: (item) => getDescriptor(item).providerPreferences,
      }),
    },
    selectedProviders: collectSelectedProviderPreferences({
      items,
      getCapabilityId,
      getProviderId,
      selectedProviderIds: selected,
    }),
  });
}

// Resolve the active subset of items and report which provider won each contested
// capability: apply provider selection, build the descriptor graph, resolve the
// seed + base + transitive dependencies, and return the items whose descriptor is
// in the resolved set, ordered by id.
export function selectDescriptorsWithProviders<T>(input: DescriptorSelectionInput<T>): {
  items: T[];
  providerSelection: ProviderSelectionResolution;
  // The graph the selection resolved against. A host that inspects the composition
  // reads it here instead of rebuilding a second catalog from the same descriptors.
  catalog: DescriptorCatalog;
} {
  const { items, getDescriptor, withDescriptor, seed } = input;

  const enabled = items.filter((item) => getDescriptor(item).disabled !== true);
  assertKnownProviderCapabilities({
    declared: items.map(getDescriptor),
    providers: enabled.map(getDescriptor),
  });
  assertSingleDefaultProvider(enabled.map(getDescriptor));

  const selected = resolveDescriptorSelection(seed);
  const baseDescriptors = toDescriptorIds(seed.baseDescriptors, 'baseDescriptors');
  assertSingleSelectedProvider(enabled.map(getDescriptor), selected);

  const selectionItems = applyProviderSelection({
    items: enabled,
    selected,
    getDescriptor,
    withDescriptor,
  });
  const catalog = createDescriptorCatalog({
    descriptors: selectionItems.map(getDescriptor),
    relationDescriptors: [...providerRelationDescriptors, ...(input.relationDescriptors ?? [])],
  });

  // Nothing to resolve against: with neither a selection nor a base floor, every
  // enabled item takes part. Sorted like every other path, because the id order is
  // a contract of this function and not of the path a given input happens to take.
  if (!selected.length && !baseDescriptors.length) {
    const items = [...enabled].sort((left, right) =>
      getDescriptor(left).id.localeCompare(getDescriptor(right).id),
    );
    return {
      items,
      providerSelection: describeProviderSelection({ items, selected, getDescriptor }),
      catalog,
    };
  }

  const selection = createCompositionSelection({
    catalog,
    selected: [...selected],
    baseDescriptors: [...baseDescriptors],
    policy: descriptorSelectionPolicy(input.policy),
  });
  // Ordered by id, which is what `getResolved` returns. It is stable for a given
  // input and independent of discovery order, so two hosts reading the same
  // workspace agree; it is NOT dependency order, and a host that needs its
  // dependencies mounted first sorts for that itself.
  const resolvedOrder = selection.getResolved();
  const resolvedIds = new Set(resolvedOrder);
  const itemsById = new Map(selectionItems.map((item) => [getDescriptor(item).id, item]));

  return {
    items: resolvedOrder
      .map((id) => itemsById.get(id))
      .filter((item): item is T => item !== undefined),
    // Described over the composed set, not the discovered one: a host that names an
    // artifact after the winning provider must not be handed a provider that this
    // composition never activates. The originally discovered descriptors are used
    // because provider selection strips the `defaultFor` a report needs.
    providerSelection: describeProviderSelection({
      items: enabled.filter((item) => resolvedIds.has(getDescriptor(item).id)),
      selected,
      getDescriptor,
    }),
    catalog,
  };
}

// The active subset alone, for hosts that do not report on the provider outcome.
export function selectDescriptors<T>(input: DescriptorSelectionInput<T>): T[] {
  return selectDescriptorsWithProviders(input).items;
}
