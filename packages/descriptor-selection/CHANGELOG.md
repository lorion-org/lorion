# @lorion-org/descriptor-selection

## 1.0.0-beta.5

### Patch Changes

- 5246ab8: Adopt unified versioning: all `@lorion-org/*` packages now share a single version and are released together, so a given release line is consistent across the whole surface.
- Updated dependencies [5246ab8]
  - @lorion-org/composition-graph@1.0.0-beta.5
  - @lorion-org/provider-selection@1.0.0-beta.5

## 1.0.0-beta.3

### Minor Changes

- 54a1b8a: Add `@lorion-org/descriptor-selection`, a framework-free, provider-aware descriptor selection package. Given items that each carry a descriptor and a selection seed, it resolves the active subset — parsing the seed, applying one-provider-per-capability selection, and resolving the dependency graph. It exposes `selectDescriptors`, `applyProviderSelection`, `resolveDescriptorSelection`, `assertSingleDefaultProvider`, and the shared `providerRelationDescriptors` / `defaultResolutionRelations` / `descriptorSelectionPolicy`. It is the single selection brain reused by the React and Nuxt adapters and by `@lorion-org/capability-composition`.
