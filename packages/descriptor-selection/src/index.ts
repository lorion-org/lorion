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
  ProviderSlotResolution,
} from '@lorion-org/provider-selection';
import {
  collectProviderRequests,
  collectProvidersByCapability,
  type ProviderSelectionRequest,
  type ProviderSelection,
  type ProviderSelectionResolution,
  type ProvidersByCapability,
  resolveProviderSelection,
} from '@lorion-org/provider-selection';

// Provider-aware descriptor selection: given a set of items that each carry a
// descriptor and a selection seed, resolve the active subset — applying
// dependency resolution and active provider-slot selection. Generic over
// the item type, so build-time bundlers, runtime hosts, and framework adapters
// share one selection brain instead of re-gluing the graph and provider layers.

// A capability's provider-owned default is an incoming edge. Dependencies that
// target provider descriptors are interpreted as provider choices before graph
// resolution and only the winning edge is retained.
export const providerRelationDescriptors: RelationDescriptor[] = [
  { direction: 'incoming', field: 'defaultFor', id: 'defaultProviders' },
];

// The relations walked when resolving, inspecting, and tracing provenance.
export const defaultResolutionRelations = ['dependencies', 'defaultProviders'] as const;

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

function assertNoRemovedProviderPreferences(descriptors: readonly Descriptor[]): void {
  const offenders = descriptors
    .filter((descriptor) => Object.hasOwn(descriptor, 'providerPreferences'))
    .map((descriptor) => descriptor.id)
    .sort();

  if (offenders.length) {
    throw new Error(
      `Descriptors ${offenders.join(', ')} use removed "providerPreferences" metadata. Select a provider through dependencies instead.`,
    );
  }
}

function descriptorIds(value: DescriptorId | DescriptorId[] | undefined): DescriptorId[] {
  return (Array.isArray(value) ? value : [value]).filter(
    (entry): entry is DescriptorId => typeof entry === 'string' && entry.length > 0,
  );
}

function sortedRequests(requests: ProviderSelectionRequest[]): ProviderSelectionRequest[] {
  return requests.sort(
    (left, right) =>
      left.capabilityId.localeCompare(right.capabilityId) ||
      left.providerId.localeCompare(right.providerId) ||
      left.sourceId.localeCompare(right.sourceId),
  );
}

function createProviderCapabilitiesById(
  descriptors: readonly Descriptor[],
): Map<DescriptorId, DescriptorId[]> {
  return new Map(
    descriptors
      .filter((descriptor) => descriptor.providesFor)
      .map((descriptor) => [descriptor.id, descriptorIds(descriptor.providesFor)]),
  );
}

function createDependencyProviderRequests(input: {
  descriptors: readonly Descriptor[];
  providerCapabilitiesById: ReadonlyMap<DescriptorId, DescriptorId[]>;
  resolvedIds: ReadonlySet<DescriptorId>;
}): ProviderSelectionRequest[] {
  const requests: ProviderSelectionRequest[] = [];

  for (const descriptor of input.descriptors) {
    if (!input.resolvedIds.has(descriptor.id)) continue;
    for (const dependencyId of Object.keys(descriptor.dependencies ?? {})) {
      for (const capabilityId of input.providerCapabilitiesById.get(dependencyId) ?? []) {
        requests.push({ capabilityId, providerId: dependencyId, sourceId: descriptor.id });
      }
    }
  }

  return sortedRequests(requests);
}

function createRequiredCapabilityIds(input: {
  descriptors: readonly Descriptor[];
  providerCapabilitiesById: ReadonlyMap<DescriptorId, DescriptorId[]>;
  providersByCapability: ProvidersByCapability;
  resolvedIds: ReadonlySet<DescriptorId>;
}): DescriptorId[] {
  const required = new Set<DescriptorId>();

  for (const descriptor of input.descriptors) {
    if (!input.resolvedIds.has(descriptor.id)) continue;
    for (const dependencyId of Object.keys(descriptor.dependencies ?? {})) {
      if (input.providersByCapability.has(dependencyId)) required.add(dependencyId);
      for (const capabilityId of input.providerCapabilitiesById.get(dependencyId) ?? []) {
        required.add(capabilityId);
      }
    }
  }

  return [...required].sort();
}

function selectedProviderSlots(resolution: ProviderSelectionResolution): ProviderSelection[] {
  return resolution.slots.filter((slot): slot is ProviderSelection => slot.state === 'selected');
}

function selectedProviderFor(
  resolution: ProviderSelectionResolution,
  capabilityId: DescriptorId,
): ProviderSelection | undefined {
  const slot = resolution.slots.find((entry) => entry.capabilityId === capabilityId);
  return slot?.state === 'selected' ? slot : undefined;
}

function stripProviderActivationRelations(
  descriptor: Descriptor,
  providerIds: ReadonlySet<DescriptorId>,
): Descriptor {
  const dependencies = Object.fromEntries(
    Object.entries(descriptor.dependencies ?? {}).filter(
      ([dependencyId]) => !providerIds.has(dependencyId),
    ),
  );
  const stripped: Descriptor = {
    ...descriptor,
    ...(Object.keys(dependencies).length ? { dependencies } : {}),
  };
  if (!Object.keys(dependencies).length) delete stripped.dependencies;
  delete stripped.defaultFor;
  return stripped;
}

function applyProviderResolution(
  descriptor: Descriptor,
  resolution: ProviderSelectionResolution,
  providerCapabilitiesById: ReadonlyMap<DescriptorId, DescriptorId[]>,
): Descriptor {
  const dependencies = Object.fromEntries(
    Object.entries(descriptor.dependencies ?? {}).filter(([dependencyId]) => {
      const capabilityIds = providerCapabilitiesById.get(dependencyId);
      if (!capabilityIds) return true;
      return capabilityIds.some(
        (capabilityId) =>
          selectedProviderFor(resolution, capabilityId)?.selectedProviderId === dependencyId,
      );
    }),
  );
  const defaultFor = descriptorIds(descriptor.defaultFor).filter((capabilityId) => {
    const selection = selectedProviderFor(resolution, capabilityId);
    return selection?.mode === 'default' && selection.selectedProviderId === descriptor.id;
  });
  const rewritten: Descriptor = {
    ...descriptor,
    ...(Object.keys(dependencies).length ? { dependencies } : {}),
    ...(defaultFor.length
      ? { defaultFor: Array.isArray(descriptor.defaultFor) ? defaultFor : defaultFor[0] }
      : {}),
  };
  if (!Object.keys(dependencies).length) delete rewritten.dependencies;
  if (!defaultFor.length) delete rewritten.defaultFor;
  return rewritten;
}

export interface DescriptorSelectionInput<T> {
  items: readonly T[];
  // Read the descriptor an item carries.
  getDescriptor: (item: T) => Descriptor;
  // Return a copy with losing provider relations removed. Keeps the item type
  // opaque to this package.
  withDescriptor: (item: T, descriptor: Descriptor) => T;
  seed: DescriptorSelectionSeed;
  // Extra relations to resolve alongside the provider relations (for example a
  // host's own dependency or grouping edges).
  relationDescriptors?: readonly RelationDescriptor[];
  policy?: Partial<CompositionPolicy>;
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

  const declared = items.map(getDescriptor);
  assertNoRemovedProviderPreferences(declared);
  const enabled = items.filter((item) => getDescriptor(item).disabled !== true);
  const descriptors = enabled.map(getDescriptor);
  assertKnownProviderCapabilities({
    declared,
    providers: descriptors,
  });
  assertSingleDefaultProvider(descriptors);

  const selected = resolveDescriptorSelection(seed);
  const baseDescriptors = toDescriptorIds(seed.baseDescriptors, 'baseDescriptors');
  const seedRoots = [...new Set([...selected, ...baseDescriptors])].sort();
  assertSingleSelectedProvider(descriptors, seedRoots);

  const providersByCapability: ProvidersByCapability = collectProvidersByCapability({
    items: descriptors,
    getCapabilityId: (descriptor) => descriptor.providesFor,
    getProviderId: (descriptor) => descriptor.id,
  });
  const providerCapabilitiesById = createProviderCapabilitiesById(descriptors);
  const providerIds = new Set(providerCapabilitiesById.keys());
  const descriptorsById = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));
  const explicitRequests = collectProviderRequests({
    items: seedRoots
      .map((id) => descriptorsById.get(id))
      .filter((descriptor): descriptor is Descriptor => Boolean(descriptor?.providesFor)),
    getCapabilityId: (descriptor) => descriptor.providesFor,
    getProviderId: (descriptor) => descriptor.id,
    getSourceId: (descriptor) => descriptor.id,
  });
  const defaultRequests = collectProviderRequests({
    items: descriptors.filter((descriptor) => descriptor.defaultFor),
    getCapabilityId: (descriptor) => descriptor.defaultFor,
    getProviderId: (descriptor) => descriptor.id,
    getSourceId: (descriptor) => descriptor.id,
  });
  const implicitSelected =
    selected.length || baseDescriptors.length
      ? []
      : descriptors
          .filter((descriptor) => !descriptor.providesFor)
          .map((descriptor) => descriptor.id);
  const strippedItems = enabled.map((item) =>
    withDescriptor(item, stripProviderActivationRelations(getDescriptor(item), providerIds)),
  );
  const strippedCatalog = createDescriptorCatalog({
    descriptors: strippedItems.map(getDescriptor),
    relationDescriptors: [...providerRelationDescriptors, ...(input.relationDescriptors ?? [])],
  });
  const providerRoots = new Set(explicitRequests.map((request) => request.providerId));
  let providerSelection: ProviderSelectionResolution = {
    slots: [],
    excludedProviderIds: [],
  };
  let iterativeResolvedIds = new Set<DescriptorId>();

  for (let iteration = 0; iteration <= descriptors.length + 1; iteration += 1) {
    const closure = createCompositionSelection({
      catalog: strippedCatalog,
      selected: [...selected, ...implicitSelected, ...providerRoots],
      baseDescriptors: [...baseDescriptors],
      policy: descriptorSelectionPolicy(input.policy),
    });
    const nextResolvedIds = new Set(closure.getResolved());
    const dependencyRequests = createDependencyProviderRequests({
      descriptors,
      providerCapabilitiesById,
      resolvedIds: nextResolvedIds,
    });
    const activeCapabilityIds = Array.from(nextResolvedIds).filter((id) =>
      providersByCapability.has(id),
    );
    const requiredCapabilityIds = createRequiredCapabilityIds({
      descriptors,
      providerCapabilitiesById,
      providersByCapability,
      resolvedIds: nextResolvedIds,
    });
    const nextProviderSelection = resolveProviderSelection({
      providersByCapability,
      requiredCapabilityIds,
      activeCapabilityIds,
      explicitRequests,
      dependencyRequests,
      defaultRequests,
    });
    const nextProviderRoots = new Set(
      selectedProviderSlots(nextProviderSelection).map((selection) => selection.selectedProviderId),
    );
    const stable =
      Array.from(nextResolvedIds).sort().join('\0') ===
        Array.from(iterativeResolvedIds).sort().join('\0') &&
      Array.from(nextProviderRoots).sort().join('\0') ===
        Array.from(providerRoots).sort().join('\0');

    iterativeResolvedIds = nextResolvedIds;
    providerSelection = nextProviderSelection;
    providerRoots.clear();
    for (const providerId of nextProviderRoots) providerRoots.add(providerId);
    if (stable) break;
    if (iteration === descriptors.length + 1) {
      throw new Error('Provider selection did not converge. Check provider dependency cycles.');
    }
  }

  const selectionItems = enabled.map((item) =>
    withDescriptor(
      item,
      applyProviderResolution(getDescriptor(item), providerSelection, providerCapabilitiesById),
    ),
  );
  const catalog = createDescriptorCatalog({
    descriptors: selectionItems.map(getDescriptor),
    relationDescriptors: [...providerRelationDescriptors, ...(input.relationDescriptors ?? [])],
  });
  const selection = createCompositionSelection({
    catalog,
    selected: [...selected, ...implicitSelected],
    baseDescriptors: [...baseDescriptors],
    policy: descriptorSelectionPolicy(input.policy),
  });
  // Ordered by id, which is what `getResolved` returns. It is stable for a given
  // input and independent of discovery order, so two hosts reading the same
  // workspace agree; it is NOT dependency order, and a host that needs its
  // dependencies mounted first sorts for that itself.
  const resolvedOrder = selection.getResolved();
  const itemsById = new Map(selectionItems.map((item) => [getDescriptor(item).id, item]));

  return {
    items: resolvedOrder
      .map((id) => itemsById.get(id))
      .filter((item): item is T => item !== undefined),
    // The same provider outcome that shaped the returned composition. Hosts can
    // report it without rebuilding or re-resolving the catalog.
    providerSelection,
    catalog,
  };
}

// The active subset alone, for hosts that do not report on the provider outcome.
export function selectDescriptors<T>(input: DescriptorSelectionInput<T>): T[] {
  return selectDescriptorsWithProviders(input).items;
}
