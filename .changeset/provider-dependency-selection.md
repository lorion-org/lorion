---
'@lorion-org/capability-composition': major
'@lorion-org/composition-graph': major
'@lorion-org/descriptor-discovery': major
'@lorion-org/descriptor-selection': major
'@lorion-org/nuxt': major
'@lorion-org/provider-selection': major
'@lorion-org/react': major
---

Use one descriptor-native contract for provider selection.

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
