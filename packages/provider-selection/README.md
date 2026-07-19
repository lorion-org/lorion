# @lorion-org/provider-selection

`@lorion-org/provider-selection` is a small framework-free core for selecting one
provider per capability from multiple candidates.

It solves these things:

- collect provider candidates by capability
- collect provider-owned defaults from descriptors
- collect provider preferences from descriptors or config-like records
- collect explicit provider preferences from selected provider ids
- optionally collect and resolve in one call
- pick one provider with configured and fallback preferences
- report misconfigured provider selections
- return excluded providers that lost the selection

Selection order is always:

1. configured provider
2. explicitly selected provider
3. fallback provider
4. first provider in deterministic sort order

If a configured provider is set but not present among the candidates, the package
does not silently fall back. It reports a mismatch and leaves that capability
unselected.

Example descriptors in this repository:

- `examples/nuxt/layer-extensions/payment-provider-stripe/extension.json`
- `examples/nuxt/layer-extensions/payment-provider-invoice/extension.json`
- `examples/react-runtime/capabilities/payment-provider-stripe/capability.json`
- `examples/react-runtime/capabilities/payment-provider-invoice/capability.json`

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

Use provider-owned defaults when a provider descriptor should decide the normal
provider for a capability:

```ts
import {
  collectProviderDefaults,
  resolveItemProviderSelection,
} from '@lorion-org/provider-selection';

const descriptors = [
  { id: 'payment-provider-stripe', providesFor: 'checkout', defaultFor: 'checkout' },
  { id: 'payment-provider-invoice', providesFor: 'checkout' },
];

const fallbackProviders = collectProviderDefaults({
  items: descriptors,
  getDefaultFor: (item) => item.defaultFor,
  getProviderId: (item) => item.id,
});

const result = resolveItemProviderSelection({
  items: descriptors,
  getCapabilityId: (item) => item.providesFor,
  getProviderId: (item) => item.id,
  fallbackProviders,
});
```

This selects Stripe with mode `fallback`. `providesFor` and `defaultFor` both
accept a string or string array, so one provider can serve multiple capabilities.

Use explicit selected providers for seed-owned overrides. This is useful when a
host app lets users select descriptors through a normal feature or profile seed,
and a selected descriptor is also a provider for a capability:

```ts
import {
  collectSelectedProviderPreferences,
  resolveItemProviderSelection,
} from '@lorion-org/provider-selection';

const selectedProviders = collectSelectedProviderPreferences({
  items: descriptors,
  getCapabilityId: (descriptor) => descriptor.providesFor,
  getProviderId: (descriptor) => descriptor.id,
  selectedProviderIds: ['payment-provider-invoice'],
});

const result = resolveItemProviderSelection({
  items: descriptors,
  getCapabilityId: (descriptor) => descriptor.providesFor,
  getProviderId: (descriptor) => descriptor.id,
  fallbackProviders,
  selectedProviders,
});
```

This selects Invoice with mode `selected`, even though Stripe owns the fallback
default. Configured providers still have higher priority.

Use configured providers for deployment-owned overrides:

```ts
import { resolveItemProviderSelection } from '@lorion-org/provider-selection';

const result = resolveItemProviderSelection({
  items: descriptors,
  getCapabilityId: (item) => item.providesFor,
  getProviderId: (item) => item.id,
  configuredProviders: { checkout: 'payment-provider-invoice' },
  fallbackProviders,
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
  providersByCapability: new Map([
    ['checkout', ['payment-provider-invoice', 'payment-provider-stripe']],
  ]),
  configuredProviders: {
    checkout: 'missing-provider',
  },
});

result.selections;
result.mismatches;
// => [{ capabilityId: 'checkout', configuredProviderId: 'missing-provider' }]
```

If profile or descriptor preferences are stored on descriptors, collect them as
fallback preferences before resolving:

```ts
import {
  collectProviderDefaults,
  collectProviderPreferences,
  resolveItemProviderSelection,
} from '@lorion-org/provider-selection';

const providerDefaults = collectProviderDefaults({
  items: descriptors,
  getDefaultFor: (descriptor) => descriptor.defaultFor,
  getProviderId: (descriptor) => descriptor.id,
});
const descriptorPreferences = collectProviderPreferences({
  items: descriptors,
  getProviderPreferences: (descriptor) => descriptor.providerPreferences,
});

const result = resolveItemProviderSelection({
  items: descriptors,
  getCapabilityId: (descriptor) => descriptor.providesFor,
  getProviderId: (descriptor) => descriptor.id,
  fallbackProviders: {
    ...providerDefaults,
    ...descriptorPreferences,
  },
});
```

## API

```ts
type CapabilityId = string;
type ProviderId = string;
type ProviderSelectionMode = 'configured' | 'selected' | 'fallback' | 'first';
type ProviderPreferenceMap = Partial<Record<CapabilityId, ProviderId>>;
type ProvidersByCapability = Map<CapabilityId, ProviderId[]>;
type ProviderCollectionInput<T> = {
  items: Iterable<T>;
  getCapabilityId: (item: T) => unknown;
  getProviderId: (item: T) => ProviderId;
};
type SelectedProviderPreferenceCollectionInput<T> = ProviderCollectionInput<T> & {
  selectedProviderIds: Iterable<ProviderId>;
};
type ProviderDefaultCollectionInput<T> = {
  items: Iterable<T>;
  getDefaultFor: (item: T) => unknown;
  getProviderId: (item: T) => ProviderId;
};

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

- `collectProviderDefaults()`
- `collectProviderPreferences()`
- `collectProvidersByCapability()`
- `collectSelectedProviderPreferences()`
- `resolveItemProviderSelection()`
- `resolveSelectedProviderRelationPreferences()`
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
