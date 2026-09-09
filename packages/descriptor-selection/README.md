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

- `selectDescriptors({ items, getDescriptor, withDescriptor, seed, relationDescriptors?, policy?, getSource? })`
  resolves the active subset of `items`. It is generic over the item type via the
  `getDescriptor` / `withDescriptor` accessors, so a "capability", an "extension",
  or a plain descriptor record all work.
- `selectDescriptorsWithProviders({ items, getDescriptor, withDescriptor, seed, relationDescriptors?, policy?, getSource? })`
  resolves the same subset and additionally returns the `ProviderSelectionResolution`
  and the `catalog` it resolved against. `selectDescriptors` wraps it for hosts that
  need only the items.
- `resolveDescriptorSelection(seed)` resolves just the selection ids from a seed.
- `resolveRequestedSelection(seed)` returns the ids the run named, or `null` when it
  named none. `resolveDescriptorSelection` falls back to `defaultSelection` on top of
  it, so a host that reports what was asked for can tell the two apart.
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
  default resolution policy. A relation a host passes as `relationDescriptors` is
  walked in the roles it declares, on top of the provider relations this package
  resolves through: naming one policy list replaces that list, and a host that only
  wanted to add an edge of its own would otherwise stop every provider from
  resolving.

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

## Capability versions

Discovery may supply several descriptors with the same logical `id` and different
`version` values. Selection returns exactly one version per resolved id. An
identity declared twice (`id` plus the exact version, including build metadata)
is ambiguous and fails before composition, including disabled duplicates.

A descriptor's `version` is a concrete SemVer version. Its `dependencies` values
are constraints, checked across the complete active composition. JSON descriptors, bundle manifests and direct descriptor input accept npm
SemVer range syntax: exact versions, caret and tilde ranges, partial and wildcard
ranges, comparator intersections, unions and hyphen ranges. Empty strings are
wildcard ranges. Prereleases match only ranges that opt into that prerelease
as defined by `node-semver`.

Candidates are considered in UTF-16 code-unit id order, then descending SemVer
precedence. Equal precedence is ordered by the version string using the same
locale-independent code-unit comparison. The first complete compatible
assignment wins; selection backtracks when a newer candidate's dependencies
cannot be satisfied. An unqualified id therefore prefers the highest compatible
version. Pin a root through an ordinary grouping descriptor:

```json
{
  "id": "legacy-product",
  "version": "1.0.0",
  "dependencies": { "feature": "1.0.0" }
}
```

Selecting `legacy-product` activates `feature@1.0.0` even when `feature@2.0.0`
is discovered elsewhere. Other active requirements still have to agree. An
unsatisfiable selection fails with the requiring descriptors, their constraints,
and the available enabled versions. Dependencies of inactive candidates and
losing provider edges impose no constraints. A policy that removes dependencies
from resolution also removes their version requirements. A host override of the
`dependencies` relation applies version requirements only when it retains the
canonical outgoing `dependencies` map with id keys. `getSource` optionally names
an item's physical source in duplicate-identity errors.

Version selection keeps each item's package name, directory and other source
metadata together. Hosts must provide a pure `withDescriptor` copy operation:
backtracking may call it more than once. It runs before graph creation, provider
activation, route generation and runtime configuration. The graph and runtime
continue to use logical ids, and never host multiple versions of an id at once.
This is workspace candidate selection; Lorion does not download packages or
rewrite application imports. Distinct sources in one workspace still need
distinct npm package names. Exact constraints prevent upgrades to a different
SemVer version. Build metadata does not participate in range matching: a pin to
`1.0.0+build-a` can also select `1.0.0+build-b`. Give implementations different
patch or prerelease versions when a range must distinguish them.

If all candidates declare the same dependency constraints, provider roles and
effective relation targets, selection resolves the provider outcome once and
chooses compatible versions independently. A fixed conflict in that case fails
without enumerating unrelated version combinations. Candidates with different
relations use backtracking; its work can grow with the combinations explored.
