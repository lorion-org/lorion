# @lorion-org/provider-selection

Framework-free resolution of active provider slots.

An active slot may be `unfilled` when no active consumer requires its capability.
A required slot must select exactly one provider. This separates three concerns
that hosts commonly need independently: whether a slot participates in a
composition, whether a consumer requires it, and which provider wins.

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

The host explicitly selects `local-auth`. The selected slot has mode `explicit`,
`required: true`, and reports `keycloak` in `overriddenProviderIds`. The result
also exposes the collected `providersByCapability` and all `excludedProviderIds`.

Pass `activeCapabilityIds` for slots that participate without being required. If
no request or default fills one, the result contains a deterministic slot such as:

```ts
{
  capabilityId: 'distribution',
  state: 'unfilled',
  required: false,
  candidateProviderIds: ['dist-a', 'dist-b'],
}
```

`ProviderSelectionResolution.slots` is a capability-sorted array, directly safe
to serialize into reports, generated modules, or runtime config. Selected slots
carry `selectedProviderId`, `mode`, and `overriddenProviderIds`; unfilled slots
carry no invented winner. `excludedProviderIds` contains every non-winning
candidate, including all candidates of an unfilled slot.

## Selection modes

`ProviderSelectionMode` is `'explicit' | 'dependency' | 'default'`:

- `explicit`: the host names the provider directly among its resolved composition
  roots. This includes roots from `selected`, `baseDescriptors`, a CLI or
  environment selection, and `defaultSelection`.
- `dependency`: an active descriptor depends on the provider descriptor.
- `default`: the provider declares `defaultFor` for the active capability. A
  default can fill a participating slot without making it required.

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
- `resolveProviderSelection()` resolves pre-grouped candidates. Its
  `activeCapabilityIds` participate in selection; its `requiredCapabilityIds`
  must be filled. Explicit and dependency requests activate and require their
  capability, while a default alone does not activate an otherwise inactive slot.
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
