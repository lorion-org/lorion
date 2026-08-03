# @lorion-org/provider-selection

Framework-free selection of exactly one provider for each required capability.

A provider declares which capability it implements. The public selection modes
name why the provider won, in this order:

1. `explicit`: a provider named directly as a composition root by the host
2. `dependency`: a provider named as a descriptor dependency
3. `default`: the provider declaring `defaultFor`

There is no implicit "first provider" fallback. Distinct providers requested at
the same tier are an error, as is a request for an unknown provider. A winner at
a higher tier records the lower-tier provider ids it overrides.

## Install

```shell
pnpm add @lorion-org/provider-selection
```

## Example

```ts
import {
  collectProviderRequests,
  resolveItemProviderSelection,
} from '@lorion-org/provider-selection';

const providers = [
  { id: 'keycloak', providesFor: 'auth' },
  { id: 'local-auth', providesFor: 'auth', defaultFor: 'auth' },
];

const result = resolveItemProviderSelection({
  items: providers,
  getCapabilityId: (provider) => provider.providesFor,
  getProviderId: (provider) => provider.id,
  requiredCapabilityIds: ['auth'],
  dependencyRequests: [{ capabilityId: 'auth', providerId: 'keycloak', sourceId: 'web' }],
  explicitRequests: collectProviderRequests({
    items: providers.filter((provider) => provider.id === 'local-auth'),
    getCapabilityId: (provider) => provider.providesFor,
    getProviderId: (provider) => provider.id,
    getSourceId: (provider) => provider.id,
  }),
  defaultRequests: [{ capabilityId: 'auth', providerId: 'local-auth', sourceId: 'local-auth' }],
});
```

The host explicitly selects `local-auth`. Its selection has mode `explicit` and
reports `keycloak` in `overriddenProviderIds`. The result also exposes the
collected `providersByCapability` and all `excludedProviderIds`.

## Selection modes

`ProviderSelectionMode` is `'explicit' | 'dependency' | 'default'`:

- `explicit`: the host names the provider directly among its resolved composition
  roots. This includes roots from `selected`, `baseDescriptors`, a CLI or
  environment selection, and `defaultSelection`.
- `dependency`: an active descriptor depends on the provider descriptor.
- `default`: the provider declares `defaultFor` for the required capability.

These are public provenance terms, not names for the graph algorithm. Internally,
Lorion may call the input that starts graph resolution a selection seed; provider
reports use `explicit` so consumers do not need that implementation vocabulary.

This package owns that vocabulary. `ProviderSelection`, composition reports, and
the Nuxt public runtime config expose the values unchanged. Internal resolution
may evolve behind them, but changing the `mode` field or one of its values is a
coordinated breaking API and serialization change, not a local wording cleanup.

## API

- `collectProvidersByCapability()` groups candidates by capability.
- `collectProviderRequests()` turns provider-like items into source-labelled
  selection requests.
- `resolveProviderSelection()` resolves pre-grouped candidates.
- `resolveItemProviderSelection()` collects candidates and resolves them in one
  call.

## Local commands

```shell
cd packages/provider-selection
pnpm build
pnpm test
pnpm coverage
pnpm typecheck
pnpm package:check
```
