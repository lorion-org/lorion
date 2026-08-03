# @lorion-org/descriptor-selection

Framework-free, provider-aware descriptor selection.

Given a set of items that each carry a descriptor and a selection seed, it
resolves the active subset: it parses the seed (explicit selection, or CLI/env
with a default selection), applies provider-slot selection,
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

## Provider contract

A normal dependency on a capability only requires that capability. A dependency
on a descriptor whose `providesFor` names that capability selects that provider.
An explicit provider root overrides descriptor dependencies, and dependencies
override `defaultFor`. Distinct providers selected at the same tier fail fast;
discovery order never decides the winner. Provider descriptors named through the
host's resolved selection or `baseDescriptors` belong to the `explicit` tier.
Provider reports forward the public provenance contract owned by
`@lorion-org/provider-selection`; `seed` remains the internal graph-input concept.

Base membership means participation, not consumption. When an active capability
has provider candidates but no resolved descriptor depends on it, the result
keeps the capability active and reports an `unfilled` provider slot. A dependency
from a resolved descriptor makes the slot required; leaving that slot unfilled is
a composition error. Dependencies of descriptors outside the resolved set do not
create requirements. A `defaultFor` provider may fill either a required slot or a
participating, non-required slot.

The removed `providerPreferences` field is rejected explicitly. Replace it with
a dependency on the provider so stale metadata cannot silently select a default.

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
