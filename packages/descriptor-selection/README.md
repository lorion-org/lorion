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

- `selectDescriptors({ items, getDescriptor, withDescriptor, seed, relationDescriptors?, policy?, getSource?, getSelectionGroupMembers? })`
  resolves the active subset of `items`. It is generic over the item type via the
  `getDescriptor` / `withDescriptor` accessors, so a "capability", an "extension",
  or a plain descriptor record all work.
- `selectDescriptorsWithProviders({ items, getDescriptor, withDescriptor, seed, relationDescriptors?, policy?, getSource?, getSelectionGroupMembers? })`
  resolves the same subset and additionally returns the `ProviderSelectionResolution`
  and the `catalog` it resolved against, together with the captured `seed` and
  `versions` containing the chosen identities, sources and requirements.
  `selectDescriptors` wraps it for hosts that need only the items.
- `resolveDescriptorSelection(seed)` resolves just the selection ids from a seed.
- `resolveRequestedSelection(seed)` returns the specifications the run named, or `null` when it
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
`getSelectionGroupMembers` identifies grouping edges in a host's item type. Provider
members reached from a grouping selected by the seed use explicit precedence;
provider members of a grouping reached only through a normal dependency keep
dependency precedence. The callback runs against a complete version assignment,
so a losing grouping version cannot contribute members. Ordinary dependencies
outside the returned membership retain dependency precedence. Membership activates
ordinary members of direct and indirectly reached groups, including nested groups.
The callback is pure and returns logical ids; version constraints remain in the
descriptor dependency map. Including a capability only as a member leaves its
provider slot optional; including a provider requests that provider.

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

Seed entries in `selected`, `defaultSelection`, and `baseDescriptors` accept an id
or `id@<SemVer range>`. An unqualified id means `id@*`: the highest compatible
stable version. A prerelease needs an explicit matching range, such as
`feature@3.0.0-beta.2` or `feature@^3.0.0-beta.1`. Registry tags (`latest`, `beta`)
are not version ranges and fail with an invalid-request error.

```ts
seed: { selected: ['feature@2', 'search@^1.4.0'], selectionSeed: false }
```

A host naming its seed flag `packages` can pass `--packages=feature@2`. CLI and
environment values accept comma-separated requests. Separate requests containing
spaces with commas, for example `--packages="feature@>=1 <2, search@1 || 2"`.
Whitespace-separated bare ids and simple `id@range` requests remain accepted.
Programmatic arrays carry one complete request per element. Scoped ids retain
their scope: `@acme/feature@2` requests id `@acme/feature` at range `2`.

Explicit non-empty `selected` wins over CLI, CLI over environment, and an absent
request falls back to `defaultSelection`. The base is always added. Multiple
requests for one id intersect, including requests from the base. A seed range and
an active JSON dependency range must both hold; neither overrides the other.
Provider precedence chooses an implementation, not permission to violate that
implementation's remaining version requirements.

Candidates are considered in UTF-16 code-unit id order, then descending SemVer
precedence. Equal precedence is ordered by the version string using the same
locale-independent comparison. The first complete compatible assignment wins;
selection backtracks when a newer candidate's dependencies cannot be satisfied.
A selected candidate with no version requirement uses the stable wildcard.
Dependencies of inactive candidates and losing provider edges impose no
constraints. Unknown seed ids, invalid requests and unsatisfiable requirements
fail separately; conflicts name the seed or requiring descriptors, their ranges
and the available enabled versions.

`resolveDescriptorSeed` captures requested specifications, selected ids, base ids
and seed requirements without selecting versions. Selection returns this captured
seed alongside `versions`: each chosen identity, its source when supplied, and
its effective seed and dependency requirements. Adapters forward these values
without reading CLI or environment inputs again. Returned values remain mutable.

A policy that removes dependencies from resolution also removes their version
requirements; explicit seed ranges still apply. A host override of `dependencies`
applies dependency version requirements only when it retains the canonical
outgoing map with id keys. `getSource` names the physical source in selection
results and duplicate-identity errors.

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

If all candidates declare the same dependency constraints, provider roles, grouping membership and
effective relation targets, selection resolves the provider outcome once and
chooses compatible versions independently. A fixed conflict in that case fails
without enumerating unrelated version combinations. Candidates with different
relations use backtracking; its work can grow with the combinations explored.
