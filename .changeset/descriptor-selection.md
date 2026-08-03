---
'@lorion-org/descriptor-selection': minor
---

Add `@lorion-org/descriptor-selection`, a framework-free, provider-aware descriptor selection package. Given items that each carry a descriptor and a selection seed, it resolves the active subset — parsing the seed, applying one-provider-per-capability selection, and resolving the dependency graph. It exposes `selectDescriptors`, `selectDescriptorsWithProviders`, `resolveDescriptorSelection`, the provider invariant assertions, and the shared `providerRelationDescriptors` / `defaultResolutionRelations` / `descriptorSelectionPolicy`. It is the single selection brain reused by the React and Nuxt adapters and by `@lorion-org/capability-composition`.
