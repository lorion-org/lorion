# @lorion-org/descriptor-selection

Framework-free, provider-aware descriptor selection.

Given a set of items that each carry a descriptor and a selection seed, it
resolves the active subset: it parses the seed (explicit selection, or CLI/env
with a default fallback), applies **one-provider-per-capability** selection,
builds the dependency graph, and returns the items reachable from the selection
and the always-on base, ordered by id. The order is stable for a given input and
independent of discovery order; it is not dependency order.

It is the shared selection brain: build-time bundler plugins, runtime hosts, and
framework adapters all reuse it instead of re-gluing the graph and provider
layers themselves.

## Install

```shell
pnpm add @lorion-org/descriptor-selection
```

## API

- `selectDescriptors({ items, getDescriptor, withDescriptor, seed, relationDescriptors?, policy? })`
  resolves the active subset of `items`. It is generic over the item type via the
  `getDescriptor` / `withDescriptor` accessors, so a "capability", an "extension",
  or a plain descriptor record all work.
- `selectDescriptorsWithProviders({ items, getDescriptor, withDescriptor, seed, relationDescriptors?, policy? })`
  resolves the same subset and additionally returns the `ProviderSelectionResolution`
  and the `catalog` it resolved against. `selectDescriptors` wraps it for hosts that
  need only the items.
- `resolveDescriptorSelection(seed)` resolves just the selection ids from a seed.
- `describeProviderSelection({ items, selected, getDescriptor })` reports which
  provider won each contested capability, in which mode, and which ones lost.
- `applyProviderSelection({ items, selected, getDescriptor, withDescriptor })` applies one-provider-per-capability selection to a set of items, the step a host reuses when it drives its own graph resolution instead of calling `selectDescriptorsWithProviders`.
- `assertKnownProviderCapabilities({ declared, providers })` throws when a descriptor
  provides for a capability no descriptor declares. A `providesFor` naming a
  capability that does not exist can never be selected, so the run says so at
  discovery instead of resolving a set that silently lacks it.
- `assertSingleDefaultProvider(descriptors)` throws if two descriptors claim
  `defaultFor` the same capability.
- `assertSingleSelectedProvider(descriptors, selected)` throws if a selection names
  more than one provider of the same capability, which would serve it twice.
- `providerRelationDescriptors`, `defaultResolutionRelations`, and
  `descriptorSelectionPolicy(policy?)` expose the provider relations and the
  default resolution policy.

## What It Is Not

- not a disk reader (see `@lorion-org/descriptor-discovery`)
- not a graph engine (see `@lorion-org/composition-graph`)
- not a host runtime or activation convention (see `@lorion-org/capability-composition`)

## Local Commands

```shell
cd packages/descriptor-selection
pnpm build
pnpm test
pnpm typecheck
```
