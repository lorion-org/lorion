# @lorion-org/provider-selection

`@lorion-org/provider-selection` is a small framework-free core for selecting one
provider per capability from multiple candidates.

It solves four things:

- collect provider candidates by capability
- optionally collect and resolve in one call
- pick one provider with configured and fallback preferences
- report misconfigured provider selections
- return excluded providers that lost the selection

Selection order is always:

1. configured provider
2. fallback provider
3. first provider in deterministic sort order

If a configured provider is set but not present among the candidates, the package
does not silently fall back. It reports a mismatch and leaves that capability
unselected.

Example files in this repository:

- `examples/command-handlers.ts`
- `examples/storage-drivers.ts`

It does not know anything about:

- framework runtime config
- feature manifests
- plugins
- filesystems
- application-specific contract names

## Install

```shell
pnpm add @lorion-org/provider-selection
```

## Example

```ts
import { resolveItemProviderSelection } from '@lorion-org/provider-selection';

const result = resolveItemProviderSelection({
  items: [
    { capability: 'auth', providerId: 'keycloak' },
    { capability: 'auth', providerId: 'auth-local-jwt' },
    { capability: 'mailer', providerId: 'mailer-postmark' },
  ],
  getCapabilityId: (item) => item.capability,
  getProviderId: (item) => item.providerId,
  configuredProviders: {
    auth: 'keycloak',
  },
  fallbackProviders: {
    mailer: 'mailer-postmark',
  },
});

result.selections;
result.providersByCapability;
result.mismatches;
result.excludedProviderIds;
```

If you already have a `Map<capability, providers>`, use the lower-level
resolver directly:

```ts
import { resolveProviderSelection } from '@lorion-org/provider-selection';

const result = resolveProviderSelection({
  providersByCapability: new Map([['auth', ['auth-local-jwt', 'keycloak']]]),
  configuredProviders: {
    auth: 'missing-provider',
  },
});

result.selections;
result.mismatches;
// => [{ capabilityId: 'auth', configuredProviderId: 'missing-provider' }]
```

## Example: command handlers

```ts
import { resolveItemProviderSelection } from '@lorion-org/provider-selection';

const result = resolveItemProviderSelection({
  items: [
    { commandId: 'open', handlerId: 'open-native' },
    { commandId: 'open', handlerId: 'open-web' },
    { commandId: 'share', handlerId: 'share-link' },
  ],
  getCapabilityId: (item) => item.commandId,
  getProviderId: (item) => item.handlerId,
  configuredProviders: {
    open: 'open-web',
  },
});
```

## Example: storage drivers

```ts
import { resolveItemProviderSelection } from '@lorion-org/provider-selection';

const result = resolveItemProviderSelection({
  items: [
    { storageKind: 'blob', driverId: 's3' },
    { storageKind: 'blob', driverId: 'filesystem' },
    { storageKind: 'queue', driverId: 'redis-streams' },
  ],
  getCapabilityId: (item) => item.storageKind,
  getProviderId: (item) => item.driverId,
  fallbackProviders: {
    blob: 'filesystem',
  },
});
```

## API

```ts
type CapabilityId = string;
type ProviderId = string;
type ProviderSelectionMode = 'configured' | 'fallback' | 'first';
type ProviderPreferenceMap = Partial<Record<CapabilityId, ProviderId>>;
type ProvidersByCapability = Map<CapabilityId, ProviderId[]>;

type ProviderSelection = {
  capabilityId: CapabilityId;
  selectedProviderId: ProviderId;
  candidateProviderIds: ProviderId[];
  mode: ProviderSelectionMode;
};

type ProviderMismatch = {
  capabilityId: CapabilityId;
  configuredProviderId: ProviderId;
};

type ProviderSelectionResolution = {
  selections: Map<CapabilityId, ProviderSelection>;
  mismatches: ProviderMismatch[];
  excludedProviderIds: ProviderId[];
};

type ItemProviderSelectionResolution = ProviderSelectionResolution & {
  providersByCapability: ProvidersByCapability;
};
```

The package exposes:

- `collectProvidersByCapability()`
- `resolveItemProviderSelection()`
- `resolveProviderSelection()`

## Local commands

```shell
cd packages/provider-selection
pnpm build
pnpm test
pnpm coverage
pnpm typecheck
pnpm package:check
```
