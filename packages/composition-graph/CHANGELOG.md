# @lorion-org/composition-graph

## 1.0.0-beta.9

### Minor Changes

- 5788936: Let a host register a relation without replacing the ones a composition already
  walks, and read the declared contribution relation.
  - `RelationDescriptor` carries optional `roles` (`resolution`, `provenance`,
    `inspection`), and `extendCompositionPolicy(policy, relationDescriptors)` appends
    each registered relation to the lists its roles name. A relation without roles is
    registered and walked by nothing, which is what happened before.
  - `providerRelationDescriptors` declares those roles, and
    `selectDescriptorsWithProviders` extends the policy with the relations it carries.
    A policy that named `resolutionRelationIds` to add an edge of its own used to drop
    the provider relation with it, and every default provider lost its slot.
  - `resolveContributions(descriptors, options?)`, `contributionRelationDescriptor()`
    and the descriptor fields `contributionPoints` / `contributesTo`: a descriptor
    offers named points, others declare which of them they fill. A contribution to an
    unknown descriptor, to a point its owner does not declare, or to the contributor
    itself aborts while the declaring descriptor can still be named. Resolution does
    not walk the relation.
  - `assertKnownReferences({ descriptors, relationDescriptors? })` reports a name no
    descriptor declares together with the descriptor that declared it and the relation
    it declared it under. A relation resolves only for a target the descriptor map
    holds, so such a name otherwise shrinks the composition in silence.

- c25cc9f: Add a workspace composition run that seals package and descriptor filesystem
  observation, plus a versioned candidate inventory and source consistency checks.
  The returned JavaScript values remain mutable. Directly selected groupings now give
  their provider members explicit precedence after grouping-version selection. Add
  version-aware contribution catalog validation and active projection, and let the
  React Vite loader consume an existing composition run without rediscovery.
  Descriptor discovery retains the exact descriptor documents in package snapshots,
  so the workspace run validates and expands them without another filesystem read.
- 29154da: Resolve one compatible version per capability id across workspace sources.

  Different versions of an id can coexist in discovery. Selection considers newer
  versions first and backtracks to satisfy active transitive dependency constraints,
  preserving provider precedence and each candidate's package and directory.
  Duplicate id/version identities and unsatisfiable requirements fail explicitly.
  Composition reports, React virtual modules and Nuxt runtime selection expose the
  resolved versions.

  Dependency ranges that were previously ignored are now enforced, even with a
  single available candidate. Correct mismatched manifests before upgrading. The
  shared schema requires concrete descriptor versions and accepts npm SemVer
  dependency ranges, including partial, wildcard, comparator, union and hyphen
  ranges. Its `semver-range` format is registered by Lorion loaders; hosts using
  the exported schema directly must register it in their validator.
  Package names must remain distinct for candidates in the same workspace.

  Custom dependency relation overrides retain their host-defined value semantics.
  Inactive providers do not multiply version search work. Origin reports derive
  grouping status and provider alternatives from the resolved source and catalog.

  Use locale-independent candidate ordering. Resolve fixed dependency/provider
  relations before choosing versions so impossible provider requirements do not
  multiply independent active version choices. Include generated React module
  execution tests in the regular package test command.

- 51c49ab: Accept `id@<SemVer range>` in explicit, default, base and CLI/env seeds. Seed
  constraints intersect with active dependency requirements; incompatible requests
  fail with their sources and available versions. Unqualified roots now require a
  stable version, replacing the previous behavior that could select a prerelease.
  Select prereleases with an explicit matching version range.

  Capture the seed with the composition result and forward selected source and
  requirement provenance to reports. React and Nuxt retain version constraints
  through loading and layer selection. Preserve ordinary provider dependencies
  outside grouping membership and consider membership in version backtracking.
  Treat an empty contribution dependency range as the npm wildcard.

## 1.0.0-beta.8

### Major Changes

- f0be779: Use one descriptor-native contract for provider selection.
  - Remove `providerPreferences` from descriptors and reject stale metadata during
    schema validation and shared descriptor selection. A descriptor selects a
    provider by depending on that provider.
  - Resolve providers by `explicit` before `dependency` before `default`, report
    overridden lower-tier choices, and fail when any tier names distinct providers.
    Explicit provider roots from both `selected` and `baseDescriptors` take part in
    the explicit tier, so a base provider cannot coexist with a competing default.
  - Remove configured/fallback maps, mismatch reporting, and the implicit
    alphabetically-first provider fallback from the provider-selection API.
  - Remove React's runtime provider re-selection API. React and Nuxt now consume the
    provider choice made by the shared descriptor selection; Nuxt exposes that
    result as a read-only runtime projection.

## 1.0.0-beta.7

### Major Changes

- 1c263f1: Reject two descriptors sharing one id.

  A composition addresses every descriptor by its id, and `buildDescriptorMap` kept the last one it saw. The first descriptor's dependencies, provider role and surface then vanished with no error: a grouping declared in a bundle manifest under the id of a discovered capability silently replaced that capability, and in the Nuxt adapter the real extension stopped registering its layer. The duplicate ids are now reported.

### Minor Changes

- 1c263f1: Match an explicit `cliKeys` entry in its prefixed form as well. `cliKeys: ['features']` previously looked for a bare `features=…` argv token and therefore matched nothing, while `key: 'features'` was prefixed to `--features`. A host reaching for `cliKeys` first hit the silent form, as Lorion's own React examples did. Entries are now tried as written and, when they carry no leading dash, also as `--<entry>`, so anything that matched before keeps matching. The prefixed spelling is tried first, so a positional argument equal to the bare key cannot outrank the flag and consume the token after it.

## 1.0.0-beta.6

## 1.0.0-beta.5

### Patch Changes

- 5246ab8: Adopt unified versioning: all `@lorion-org/*` packages now share a single version and are released together, so a given release line is consistent across the whole surface.

## 1.0.0-beta.2

### Minor Changes

- ac3c152: Add descriptor selection seed normalization for CLI, environment, and default host inputs.
- ac3c152: Prefer explicitly selected provider descriptors over descriptor-level provider preferences and defaults, and expose a Lorion source export condition for workspace playground development.
- ac3c152: Add shared capability selection seed defaults for framework adapters.

## 1.0.0

### Minor Changes

- 23a50f0: Introduce the first framework-free `composition-graph` package with generic descriptor, relation, catalog, and composition primitives.

  The package now provides deterministic descriptor catalogs, relation graph helpers, selection resolution with provenance, base descriptor support, provider relation fields, and package examples for deployment composition flows.

## 1.0.0-beta.0

- Initial beta package.
