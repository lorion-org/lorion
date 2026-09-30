# @lorion-org/provider-selection

## 1.0.0-beta.9

## 1.0.0-beta.8

### Major Changes

- edd8bb9: Model provider choices as active slots whose participation, requirement, and
  selection are independent.
  - A capability with provider candidates may remain active and visibly `unfilled`
    when no resolved descriptor depends on it.
  - Dependencies of resolved descriptors make the capability required; explicit
    and concrete dependency requests still select and require a provider, while a
    default may fill an active non-required slot.
  - Replace the winner-only `selections` map with a serializable, capability-sorted
    `slots` array. Each slot is a `selected` or `unfilled` discriminated state and
    carries its requirement and candidates.
  - Publish the same provider-slot result through composition reports, Nuxt public
    runtime config, and React's `virtual:capabilities` module.

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

## 1.0.0-beta.6

## 1.0.0-beta.5

### Patch Changes

- 5246ab8: Adopt unified versioning: all `@lorion-org/*` packages now share a single version and are released together, so a given release line is consistent across the whole surface.

## 1.0.0-beta.2

### Minor Changes

- ac3c152: Prefer explicitly selected provider descriptors over descriptor-level provider preferences and defaults, and expose a Lorion source export condition for workspace playground development.

## 1.0.0

### Minor Changes

- 23a50f0: Add the initial framework-free provider selection package.

  The package now collects provider candidates and descriptor preferences, resolves configured and fallback providers deterministically, reports mismatches, returns excluded providers, and includes examples for command handlers, payment checkout, preferences, and storage drivers.

## 1.0.0-beta.0

- Initial beta package.
