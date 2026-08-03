export type CapabilityId = string;
export type ProviderId = string;

// Public serialized provenance contract. Composition reports and Nuxt runtime
// config forward these values unchanged, so renaming, removing, or repurposing a
// value is a coordinated breaking change across every package that exposes it.
export type ProviderSelectionMode = 'explicit' | 'dependency' | 'default';

export type ProviderSelectionRequest = {
  capabilityId: CapabilityId;
  providerId: ProviderId;
  sourceId: string;
};

export type ProviderSelection = {
  capabilityId: CapabilityId;
  state: 'selected';
  required: boolean;
  selectedProviderId: ProviderId;
  candidateProviderIds: readonly ProviderId[];
  overriddenProviderIds: readonly ProviderId[];
  mode: ProviderSelectionMode;
};

export type UnfilledProviderSlot = {
  capabilityId: CapabilityId;
  state: 'unfilled';
  required: false;
  candidateProviderIds: readonly ProviderId[];
};

export type ProviderSlotResolution = ProviderSelection | UnfilledProviderSlot;

export type ProvidersByCapability = Map<CapabilityId, ProviderId[]>;

export type ProviderSelectionResolution = {
  slots: readonly ProviderSlotResolution[];
  excludedProviderIds: readonly ProviderId[];
};

export type ItemProviderSelectionResolution = ProviderSelectionResolution & {
  providersByCapability: ProvidersByCapability;
};

type ProviderCollectionInput<T> = {
  items: Iterable<T>;
  getCapabilityId: (item: T) => CapabilityId | CapabilityId[] | undefined;
  getProviderId: (item: T) => ProviderId;
};

export type ProviderRequestCollectionInput<T> = ProviderCollectionInput<T> & {
  getSourceId: (item: T) => string;
};

export type ResolveProviderSelectionInput = {
  providersByCapability: ProvidersByCapability;
  activeCapabilityIds?: Iterable<CapabilityId>;
  requiredCapabilityIds: Iterable<CapabilityId>;
  explicitRequests?: Iterable<ProviderSelectionRequest>;
  dependencyRequests?: Iterable<ProviderSelectionRequest>;
  defaultRequests?: Iterable<ProviderSelectionRequest>;
};

export type ResolveItemProviderSelectionInput<T> = ProviderCollectionInput<T> &
  Omit<ResolveProviderSelectionInput, 'providersByCapability'>;

function toSortedUniqueIds(ids: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(ids).filter(Boolean))).sort();
}

function toCapabilityIds(value: CapabilityId | CapabilityId[] | undefined): CapabilityId[] {
  const entries = Array.isArray(value) ? value : [value];

  return entries.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

function groupRequests(
  requests: Iterable<ProviderSelectionRequest> = [],
): Map<CapabilityId, ProviderSelectionRequest[]> {
  const grouped = new Map<CapabilityId, ProviderSelectionRequest[]>();

  for (const request of requests) {
    if (!request.capabilityId || !request.providerId || !request.sourceId) continue;
    const current = grouped.get(request.capabilityId) ?? [];
    if (
      !current.some(
        (entry) => entry.providerId === request.providerId && entry.sourceId === request.sourceId,
      )
    ) {
      current.push(request);
    }
    grouped.set(request.capabilityId, current);
  }

  return grouped;
}

function describeConflictingRequests(requests: readonly ProviderSelectionRequest[]): string {
  return toSortedUniqueIds(requests.map((request) => request.providerId))
    .map((providerId) => {
      const sources = toSortedUniqueIds(
        requests
          .filter((request) => request.providerId === providerId)
          .map((request) => request.sourceId),
      );
      return `${providerId} (${sources.join(', ')})`;
    })
    .join(', ');
}

function resolveTier(input: {
  capabilityId: CapabilityId;
  mode: ProviderSelectionMode;
  requests: readonly ProviderSelectionRequest[];
}): ProviderId | undefined {
  const providerIds = toSortedUniqueIds(input.requests.map((request) => request.providerId));
  if (!providerIds.length) return undefined;

  if (providerIds.length > 1) {
    throw new Error(
      `Provider selection for capability "${input.capabilityId}" has multiple ${input.mode} providers: ${describeConflictingRequests(input.requests)}. Select exactly one provider.`,
    );
  }

  return providerIds[0];
}

function validateRequests(input: {
  providersByCapability: ProvidersByCapability;
  tiers: readonly {
    mode: ProviderSelectionMode;
    requests: ReadonlyMap<CapabilityId, ProviderSelectionRequest[]>;
  }[];
}): void {
  for (const tier of input.tiers) {
    for (const [capabilityId, requests] of tier.requests) {
      resolveTier({ capabilityId, mode: tier.mode, requests });
      const candidates = toSortedUniqueIds(input.providersByCapability.get(capabilityId) ?? []);
      for (const providerId of toSortedUniqueIds(requests.map((request) => request.providerId))) {
        if (!candidates.includes(providerId)) {
          throw new Error(
            `Provider selection for capability "${capabilityId}" names unknown provider "${providerId}". Candidates: ${candidates.length ? candidates.join(', ') : '(none)'}.`,
          );
        }
      }
    }
  }
}

export function collectProvidersByCapability<T>(
  input: ProviderCollectionInput<T>,
): ProvidersByCapability {
  const providersByCapability: ProvidersByCapability = new Map();

  for (const item of input.items) {
    const providerId = input.getProviderId(item);
    for (const capabilityId of toCapabilityIds(input.getCapabilityId(item))) {
      const currentProviderIds = providersByCapability.get(capabilityId) ?? [];
      currentProviderIds.push(providerId);
      providersByCapability.set(capabilityId, toSortedUniqueIds(currentProviderIds));
    }
  }

  return providersByCapability;
}

export function collectProviderRequests<T>(
  input: ProviderRequestCollectionInput<T>,
): ProviderSelectionRequest[] {
  const requests: ProviderSelectionRequest[] = [];

  for (const item of input.items) {
    const providerId = input.getProviderId(item);
    const sourceId = input.getSourceId(item);
    for (const capabilityId of toCapabilityIds(input.getCapabilityId(item))) {
      requests.push({ capabilityId, providerId, sourceId });
    }
  }

  return requests.sort(
    (left, right) =>
      left.capabilityId.localeCompare(right.capabilityId) ||
      left.providerId.localeCompare(right.providerId) ||
      left.sourceId.localeCompare(right.sourceId),
  );
}

export function resolveProviderSelection(
  input: ResolveProviderSelectionInput,
): ProviderSelectionResolution {
  const explicitRequests = groupRequests(input.explicitRequests);
  const dependencyRequests = groupRequests(input.dependencyRequests);
  const defaultRequests = groupRequests(input.defaultRequests);
  const tiers = [
    { mode: 'explicit' as const, requests: explicitRequests },
    { mode: 'dependency' as const, requests: dependencyRequests },
    { mode: 'default' as const, requests: defaultRequests },
  ];
  validateRequests({ providersByCapability: input.providersByCapability, tiers });

  const requiredCapabilityIds = new Set([
    ...toSortedUniqueIds(input.requiredCapabilityIds),
    ...explicitRequests.keys(),
    ...dependencyRequests.keys(),
  ]);
  const activeCapabilityIds = new Set([
    ...toSortedUniqueIds(input.activeCapabilityIds ?? []),
    ...requiredCapabilityIds,
  ]);
  const slots: ProviderSlotResolution[] = [];

  for (const capabilityId of toSortedUniqueIds(activeCapabilityIds)) {
    const candidates = toSortedUniqueIds(input.providersByCapability.get(capabilityId) ?? []);
    const required = requiredCapabilityIds.has(capabilityId);
    if (!candidates.length && required) {
      throw new Error(
        `Provider selection requires capability "${capabilityId}", but no provider declares providesFor "${capabilityId}".`,
      );
    }

    const slotTiers = [
      { mode: 'explicit' as const, requests: explicitRequests.get(capabilityId) ?? [] },
      { mode: 'dependency' as const, requests: dependencyRequests.get(capabilityId) ?? [] },
      { mode: 'default' as const, requests: defaultRequests.get(capabilityId) ?? [] },
    ];
    // Validate every tier before applying precedence. A valid explicit choice may
    // override a dependency choice, but it must not hide that two descriptors
    // made contradictory choices at the dependency tier.
    const tierProviderIds = slotTiers.map((tier) => resolveTier({ capabilityId, ...tier }));
    const selectedTierIndex = tierProviderIds.findIndex(Boolean);
    const selectedProviderId = tierProviderIds[selectedTierIndex];
    const selectedMode = slotTiers[selectedTierIndex]?.mode;

    if (!selectedProviderId || !selectedMode) {
      if (required) {
        throw new Error(
          `Provider selection for capability "${capabilityId}" has candidates (${candidates.join(', ')}) but no provider was selected by an explicit root, descriptor dependency, or defaultFor.`,
        );
      }
      slots.push({
        capabilityId,
        state: 'unfilled',
        required: false,
        candidateProviderIds: candidates,
      });
      continue;
    }

    const overriddenProviderIds = toSortedUniqueIds(
      slotTiers
        .slice(selectedTierIndex + 1)
        .flatMap((tier) => tier.requests.map((request) => request.providerId))
        .filter((providerId) => providerId !== selectedProviderId),
    );

    slots.push({
      capabilityId,
      state: 'selected',
      required,
      selectedProviderId,
      candidateProviderIds: candidates,
      overriddenProviderIds,
      mode: selectedMode,
    });
  }

  const excludedProviderIds = toSortedUniqueIds(
    slots.flatMap((slot) =>
      slot.state === 'selected'
        ? slot.candidateProviderIds.filter((providerId) => providerId !== slot.selectedProviderId)
        : slot.candidateProviderIds,
    ),
  );

  return { slots, excludedProviderIds };
}

export function resolveItemProviderSelection<T>(
  input: ResolveItemProviderSelectionInput<T>,
): ItemProviderSelectionResolution {
  const providersByCapability = collectProvidersByCapability(input);
  const resolution = resolveProviderSelection({
    providersByCapability,
    ...(input.activeCapabilityIds ? { activeCapabilityIds: input.activeCapabilityIds } : {}),
    requiredCapabilityIds: input.requiredCapabilityIds,
    ...(input.explicitRequests ? { explicitRequests: input.explicitRequests } : {}),
    ...(input.dependencyRequests ? { dependencyRequests: input.dependencyRequests } : {}),
    ...(input.defaultRequests ? { defaultRequests: input.defaultRequests } : {}),
  });

  return { providersByCapability, ...resolution };
}
