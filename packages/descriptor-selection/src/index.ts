import {
  createCompositionSelection,
  createDescriptorCatalog,
  resolveDescriptorSelectionSeed,
  type CompositionPolicy,
  type Descriptor,
  type DescriptorId,
  type RelationDescriptor,
} from '@lorion-org/composition-graph';
import {
  collectSelectedProviderPreferences,
  resolveSelectedProviderRelationPreferences,
  type ProviderPreferenceMap,
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

// The active selection ids from a seed: explicit `selected` wins; otherwise the
// CLI/env seed is parsed, falling back to `defaultSelection`. Base descriptors are
// resolved separately by the graph and are not part of this list.
export function resolveDescriptorSelection(seed: DescriptorSelectionSeed): DescriptorId[] {
  if (seed.selected?.length) return [...seed.selected];
  if (seed.selectionSeed === false) return [...(seed.defaultSelection ?? [])];

  const options = seed.selectionSeed ?? {};
  const selected = resolveDescriptorSelectionSeed({
    argv: options.argv ?? process.argv,
    env: options.env ?? process.env,
    key: options.key ?? 'capability',
    ...(options.cliKeys ? { cliKeys: options.cliKeys } : {}),
    ...(options.envKeys ? { envKeys: options.envKeys } : {}),
  });

  return selected.length ? selected : [...(seed.defaultSelection ?? [])];
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
      providerPreferences: descriptor.providerPreferences as ProviderPreferenceMap | undefined,
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

// Resolve the active subset of items: apply provider selection, build the
// descriptor graph, resolve the seed + base + transitive dependencies, and return
// the items whose descriptor is in the resolved set — in their original order.
export function selectDescriptors<T>(input: DescriptorSelectionInput<T>): T[] {
  const { items, getDescriptor, withDescriptor, seed } = input;

  const enabled = items.filter((item) => getDescriptor(item).disabled !== true);
  assertSingleDefaultProvider(enabled.map(getDescriptor));

  const selected = resolveDescriptorSelection(seed);
  if (!selected.length && !seed.baseDescriptors?.length) return [...enabled];

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
  const selection = createCompositionSelection({
    catalog,
    selected: [...selected],
    baseDescriptors: [...(seed.baseDescriptors ?? [])],
    policy: descriptorSelectionPolicy(input.policy),
  });
  const resolvedIds = new Set(selection.getResolved());

  return selectionItems.filter((item) => resolvedIds.has(getDescriptor(item).id));
}
