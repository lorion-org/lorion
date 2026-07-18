---
'@lorion-org/capability-composition': patch
'@lorion-org/react': minor
'@lorion-org/nuxt': minor
---

Consume `@lorion-org/descriptor-selection` for provider-aware descriptor selection instead of each package re-implementing the same discover→provider-dedup→graph pipeline. The React adapter keeps re-exporting `defaultCapabilityRelationDescriptors`, `createCapabilityCompositionPolicy`, and `defaultCapabilityResolutionRelations` unchanged.

Behavior changes:

- The "exactly one `defaultFor` provider per capability" guard now runs in all three adapters (React, Nuxt, and capability-composition). A descriptor set where two providers both declare `defaultFor` the same capability now throws instead of silently resolving both — previously only capability-composition enforced this.
- `capability-composition`'s `resolveSelectedCapabilities` now excludes descriptors marked `disabled: true`, matching the React and Nuxt adapters.
