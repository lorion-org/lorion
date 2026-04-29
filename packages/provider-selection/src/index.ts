export type CapabilityId = string;
export type ProviderId = string;

export type ProviderSelectionMode = 'configured' | 'fallback' | 'first';
export type ProviderPreferenceMap = Partial<Record<CapabilityId, ProviderId>>;

export type ProviderSelection = {
  capabilityId: CapabilityId;
  selectedProviderId: ProviderId;
  candidateProviderIds: ProviderId[];
  mode: ProviderSelectionMode;
};

export type ProviderMismatch = {
  capabilityId: CapabilityId;
  configuredProviderId: ProviderId;
};

export type ProvidersByCapability = Map<CapabilityId, ProviderId[]>;

export type ProviderSelectionResolution = {
  selections: Map<CapabilityId, ProviderSelection>;
  mismatches: ProviderMismatch[];
  excludedProviderIds: ProviderId[];
};
export type ItemProviderSelectionResolution = ProviderSelectionResolution & {
  providersByCapability: ProvidersByCapability;
};

type ProviderCollectionInput<T> = {
  items: Iterable<T>;
  getCapabilityId: (item: T) => CapabilityId | undefined;
  getProviderId: (item: T) => ProviderId;
};

export type ResolveProviderSelectionInput = {
  providersByCapability: ProvidersByCapability;
  configuredProviders?: ProviderPreferenceMap;
  fallbackProviders?: ProviderPreferenceMap;
};

export type ResolveItemProviderSelectionInput<T> = ProviderCollectionInput<T> & {
  configuredProviders?: ProviderPreferenceMap;
  fallbackProviders?: ProviderPreferenceMap;
};

function toSortedUniqueProviderIds(providerIds: Iterable<ProviderId>): ProviderId[] {
  return Array.from(new Set(Array.from(providerIds).filter(Boolean))).sort();
}

function getSelectedProvider(input: {
  capabilityId: CapabilityId;
  candidateProviderIds: ProviderId[];
  configuredProviders?: ProviderPreferenceMap;
  fallbackProviders?: ProviderPreferenceMap;
}): { selectedProviderId: ProviderId; mode: ProviderSelectionMode } | undefined {
  const firstProviderId = input.candidateProviderIds[0];
  if (!firstProviderId) {
    return undefined;
  }

  const configuredProviderId = input.configuredProviders?.[input.capabilityId];
  if (configuredProviderId) {
    if (input.candidateProviderIds.includes(configuredProviderId)) {
      return {
        selectedProviderId: configuredProviderId,
        mode: 'configured',
      };
    }

    return undefined;
  }

  const fallbackProviderId = input.fallbackProviders?.[input.capabilityId];
  if (fallbackProviderId && input.candidateProviderIds.includes(fallbackProviderId)) {
    return {
      selectedProviderId: fallbackProviderId,
      mode: 'fallback',
    };
  }

  return {
    selectedProviderId: firstProviderId,
    mode: 'first',
  };
}

function selectProviders(
  input: ResolveProviderSelectionInput,
): Map<CapabilityId, ProviderSelection> {
  const selections: Map<CapabilityId, ProviderSelection> = new Map();

  for (const [capabilityId, candidateProviderIds] of Array.from(
    input.providersByCapability.entries(),
  ).sort(([left], [right]) => left.localeCompare(right))) {
    const normalizedCandidateProviderIds = toSortedUniqueProviderIds(candidateProviderIds);
    const selected = getSelectedProvider({
      capabilityId,
      candidateProviderIds: normalizedCandidateProviderIds,
      ...(input.configuredProviders ? { configuredProviders: input.configuredProviders } : {}),
      ...(input.fallbackProviders ? { fallbackProviders: input.fallbackProviders } : {}),
    });

    if (!selected) {
      continue;
    }

    selections.set(capabilityId, {
      capabilityId,
      selectedProviderId: selected.selectedProviderId,
      candidateProviderIds: normalizedCandidateProviderIds,
      mode: selected.mode,
    });
  }

  return selections;
}

function findConfiguredProviderMismatches(
  input: ResolveProviderSelectionInput,
): ProviderMismatch[] {
  const mismatches: ProviderMismatch[] = [];

  for (const [capabilityId, configuredProviderId] of Object.entries(
    input.configuredProviders ?? {},
  ).sort(([left], [right]) => left.localeCompare(right))) {
    if (!configuredProviderId) {
      continue;
    }

    const candidateProviderIds = toSortedUniqueProviderIds(
      input.providersByCapability.get(capabilityId) ?? [],
    );
    if (!candidateProviderIds.length) {
      continue;
    }

    if (candidateProviderIds.includes(configuredProviderId)) {
      continue;
    }

    mismatches.push({
      capabilityId,
      configuredProviderId,
    });
  }

  return mismatches;
}

function getExcludedProviders(selections: Iterable<ProviderSelection>): ProviderId[] {
  const excludedProviderIds: ProviderId[] = [];

  for (const selection of selections) {
    if (selection.candidateProviderIds.length <= 1) {
      continue;
    }

    for (const candidateProviderId of selection.candidateProviderIds) {
      if (candidateProviderId !== selection.selectedProviderId) {
        excludedProviderIds.push(candidateProviderId);
      }
    }
  }

  return toSortedUniqueProviderIds(excludedProviderIds);
}

export function collectProvidersByCapability<T>(
  input: ProviderCollectionInput<T>,
): ProvidersByCapability {
  const providersByCapability: ProvidersByCapability = new Map();

  for (const item of input.items) {
    const capabilityId = input.getCapabilityId(item);
    if (!capabilityId) {
      continue;
    }

    const providerId = input.getProviderId(item);
    const currentProviderIds = providersByCapability.get(capabilityId) ?? [];
    currentProviderIds.push(providerId);
    providersByCapability.set(capabilityId, toSortedUniqueProviderIds(currentProviderIds));
  }

  return providersByCapability;
}

export function resolveProviderSelection(
  input: ResolveProviderSelectionInput,
): ProviderSelectionResolution {
  const selections = selectProviders(input);
  const mismatches = findConfiguredProviderMismatches(input);
  const excludedProviderIds = getExcludedProviders(selections.values());

  return {
    selections,
    mismatches,
    excludedProviderIds,
  };
}

export function resolveItemProviderSelection<T>(
  input: ResolveItemProviderSelectionInput<T>,
): ItemProviderSelectionResolution {
  const providersByCapability = collectProvidersByCapability(input);

  const resolution = resolveProviderSelection({
    providersByCapability,
    ...(input.configuredProviders ? { configuredProviders: input.configuredProviders } : {}),
    ...(input.fallbackProviders ? { fallbackProviders: input.fallbackProviders } : {}),
  });

  return {
    providersByCapability,
    ...resolution,
  };
}
