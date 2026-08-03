# @lorion-org/composition-graph

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
