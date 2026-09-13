import {
  resolveDescriptorSeed,
  type DescriptorSelectionSeed,
  type ResolvedDescriptorSeed,
} from './seed';
export {
  resolveDescriptorSeed,
  resolveDescriptorSelection,
  resolveRequestedSelection,
} from './seed';
export type {
  DescriptorSelectionSeed,
  DescriptorVersionRequirement,
  ResolvedDescriptorSeed,
} from './seed';
export type { DescriptorVersionSelection } from './versions';
import { selectVersions, type DescriptorVersionSelection } from './versions';
import {
  assertKnownDescriptorIds,
  createCompositionSelection,
  createDescriptorCatalog,
  defaultRelationDescriptors,
  extendCompositionPolicy,
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
  {
    direction: 'incoming',
    field: 'defaultFor',
    id: 'defaultProviders',
    // Carried on the relation so a host policy extends it instead of replacing it: a
    // policy that names `resolutionRelationIds` to add an edge of its own would
    // otherwise drop this one, and every default provider would lose its slot.
    roles: ['resolution', 'provenance', 'inspection'],
  },
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
  explicitGroupingMembers: ReadonlyMap<DescriptorId, ReadonlySet<DescriptorId>>;
  providerCapabilitiesById: ReadonlyMap<DescriptorId, DescriptorId[]>;
  resolvedIds: ReadonlySet<DescriptorId>;
}): ProviderSelectionRequest[] {
  const requests: ProviderSelectionRequest[] = [];

  for (const descriptor of input.descriptors) {
    if (!input.resolvedIds.has(descriptor.id)) continue;
    for (const dependencyId of Object.keys(descriptor.dependencies ?? {})) {
      if (input.explicitGroupingMembers.get(descriptor.id)?.has(dependencyId)) continue;
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
  // Optional physical source label used in duplicate-identity diagnostics.
  getSource?: (item: T) => string;
  // Return a copy with losing provider relations removed. Keeps the item type
  // opaque to this package.
  withDescriptor: (item: T, descriptor: Descriptor) => T;
  // Members of a selection grouping carried by this item. Providers reached from a
  // grouping named by the seed have the same explicit precedence as a provider named
  // directly. A grouping reached through an ordinary dependency keeps dependency
  // precedence. The callback is evaluated after version assignment, so only the
  // members of the selected grouping version take part.
  getSelectionGroupMembers?: (item: T) => readonly DescriptorId[] | undefined;
  seed: DescriptorSelectionSeed;
  // Extra relations to resolve alongside the provider relations (for example a
  // host's own dependency or grouping edges).
  relationDescriptors?: readonly RelationDescriptor[];
  policy?: Partial<CompositionPolicy>;
}

export interface DescriptorSelectionResult<T> {
  items: T[];
  providerSelection: ProviderSelectionResolution;
  catalog: DescriptorCatalog;
  seed: ResolvedDescriptorSeed;
  versions: DescriptorVersionSelection[];
}

// Resolve the active subset of items and report which provider won each contested
// capability: apply provider selection, build the descriptor graph, resolve the
// seed + base + transitive dependencies, and return the items whose descriptor is
// in the resolved set, ordered by id.
export function selectDescriptorsWithProviders<T>(
  input: DescriptorSelectionInput<T>,
): DescriptorSelectionResult<T> {
  const seed = resolveDescriptorSeed(input.seed);
  assertNoRemovedProviderPreferences(input.items.map(input.getDescriptor));
  assertKnownProviderCapabilities({
    declared: input.items.map(input.getDescriptor),
    providers: input.items
      .map(input.getDescriptor)
      .filter((descriptor) => descriptor.disabled !== true),
  });
  const enabledById = new Map(
    input.items
      .map(input.getDescriptor)
      .filter((descriptor) => descriptor.disabled !== true)
      .map((descriptor) => [descriptor.id, descriptor]),
  );
  assertKnownDescriptorIds(enabledById, [...seed.selected], 'selected descriptors');
  assertKnownDescriptorIds(enabledById, [...seed.baseDescriptors], 'base descriptors');
  const relations = [
    ...new Map(
      [
        ...defaultRelationDescriptors,
        ...providerRelationDescriptors,
        ...(input.relationDescriptors ?? []),
      ].map((relation) => [relation.id, relation]),
    ).values(),
  ];
  const policy = extendCompositionPolicy(descriptorSelectionPolicy(input.policy), [
    ...providerRelationDescriptors,
    ...(input.relationDescriptors ?? []),
  ]);
  const resolutionRelations = relations.filter((relation) =>
    policy.resolutionRelationIds?.includes(relation.id),
  );
  const dependencyRelation = resolutionRelations.find((relation) => relation.id === 'dependencies');
  // A host may redefine a graph relation. Version requirements belong only to the
  // canonical outgoing dependency map, not arbitrary host-owned relation values.
  const resolveDependencies = Boolean(
    dependencyRelation &&
    (dependencyRelation.field ?? dependencyRelation.id) === 'dependencies' &&
    dependencyRelation.direction !== 'incoming' &&
    dependencyRelation.targetMode !== 'values',
  );
  const result = selectVersions({
    items: input.items,
    getDescriptor: input.getDescriptor,
    ...(input.getSource ? { getSource: input.getSource } : {}),
    resolve: (items) => selectSingleVersionDescriptors({ ...input, items }, seed),
    requirements: seed.requirements,
    ...(input.getSelectionGroupMembers
      ? { getSelectionGroupMembers: input.getSelectionGroupMembers }
      : {}),
    resolveDependencies,
    resolutionRelations,
    roots: [...seed.selected, ...seed.baseDescriptors],
  });
  return { ...result, seed };
}

function selectSingleVersionDescriptors<T>(
  input: DescriptorSelectionInput<T>,
  seed: ResolvedDescriptorSeed,
): {
  items: T[];
  providerSelection: ProviderSelectionResolution;
  // The graph the selection resolved against. A host that inspects the composition
  // reads it here instead of rebuilding a second catalog from the same descriptors.
  catalog: DescriptorCatalog;
} {
  const { items, getDescriptor, withDescriptor } = input;

  const declared = items.map(getDescriptor);
  assertNoRemovedProviderPreferences(declared);
  const enabled = items.filter((item) => getDescriptor(item).disabled !== true);
  const descriptors = enabled.map(getDescriptor);
  assertSingleDefaultProvider(descriptors);

  const selected = seed.selected;
  const baseDescriptors = seed.baseDescriptors;
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
  const itemsByDescriptorId = new Map(enabled.map((item) => [getDescriptor(item).id, item]));
  const explicitlySelectedIds = new Set(seedRoots);
  const explicitGroupingMembers = new Map<DescriptorId, ReadonlySet<DescriptorId>>();
  if (input.getSelectionGroupMembers) {
    const pending = [...seedRoots];
    const visitedGroups = new Set<DescriptorId>();
    while (pending.length) {
      const groupId = pending.shift()!;
      if (visitedGroups.has(groupId)) continue;
      visitedGroups.add(groupId);
      const group = itemsByDescriptorId.get(groupId);
      if (!group) continue;
      const members = input.getSelectionGroupMembers(group);
      if (!members) continue;
      explicitGroupingMembers.set(groupId, new Set(members));
      assertKnownDescriptorIds(descriptorsById, [...members], `members of grouping "${groupId}"`);
      for (const memberId of members) {
        explicitlySelectedIds.add(memberId);
        pending.push(memberId);
      }
    }
  }
  const explicitRequests = collectProviderRequests({
    items: [...explicitlySelectedIds]
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
  const relationDescriptors = [
    ...providerRelationDescriptors,
    ...(input.relationDescriptors ?? []),
  ];
  // The relations a host registers take part in the roles they declare, on top of the
  // provider relations this package resolves through. Without this a host that adds a
  // relation would have to restate the provider relations in its own policy, and
  // forgetting one stops providers from resolving at all.
  const policy = extendCompositionPolicy(
    descriptorSelectionPolicy(input.policy),
    relationDescriptors,
  );
  const strippedCatalog = createDescriptorCatalog({
    descriptors: strippedItems.map(getDescriptor),
    relationDescriptors,
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
      selected: [...explicitlySelectedIds, ...implicitSelected, ...providerRoots],
      baseDescriptors: [...baseDescriptors],
      policy,
    });
    const nextResolvedIds = new Set(closure.getResolved());
    const dependencyRequests = createDependencyProviderRequests({
      descriptors,
      explicitGroupingMembers,
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
    relationDescriptors,
  });
  const selection = createCompositionSelection({
    catalog,
    selected: [...explicitlySelectedIds, ...implicitSelected],
    baseDescriptors: [...baseDescriptors],
    policy,
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
