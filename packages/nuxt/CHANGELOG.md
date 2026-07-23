# @lorion-org/nuxt

## 1.0.0-beta.6

### Patch Changes

- Updated dependencies [c549690]
- Updated dependencies [7450d75]
  - @lorion-org/descriptor-discovery@1.0.0-beta.6
  - @lorion-org/descriptor-selection@1.0.0-beta.6
  - @lorion-org/composition-graph@1.0.0-beta.6
  - @lorion-org/provider-selection@1.0.0-beta.6
  - @lorion-org/runtime-config@1.0.0-beta.6
  - @lorion-org/runtime-config-node@1.0.0-beta.6

## 1.0.0-beta.5

### Patch Changes

- 5246ab8: Adopt unified versioning: all `@lorion-org/*` packages now share a single version and are released together, so a given release line is consistent across the whole surface.
- Updated dependencies [5246ab8]
  - @lorion-org/composition-graph@1.0.0-beta.5
  - @lorion-org/descriptor-discovery@1.0.0-beta.5
  - @lorion-org/descriptor-selection@1.0.0-beta.5
  - @lorion-org/provider-selection@1.0.0-beta.5
  - @lorion-org/runtime-config@1.0.0-beta.5
  - @lorion-org/runtime-config-node@1.0.0-beta.5

## 1.0.0-beta.3

### Minor Changes

- 0b36ee9: Consume `@lorion-org/descriptor-selection` for provider-aware descriptor selection instead of each package re-implementing the same discover→provider-dedup→graph pipeline. The React adapter keeps re-exporting `defaultCapabilityRelationDescriptors`, `createCapabilityCompositionPolicy`, and `defaultCapabilityResolutionRelations` unchanged.

  Behavior changes:
  - The "exactly one `defaultFor` provider per capability" guard now runs in all three adapters (React, Nuxt, and capability-composition). A descriptor set where two providers both declare `defaultFor` the same capability now throws instead of silently resolving both — previously only capability-composition enforced this.
  - `capability-composition`'s `resolveSelectedCapabilities` now excludes descriptors marked `disabled: true`, matching the React and Nuxt adapters.

### Patch Changes

- Updated dependencies [54a1b8a]
- Updated dependencies [04d2ee5]
  - @lorion-org/descriptor-selection@1.0.0-beta.3
  - @lorion-org/descriptor-discovery@1.0.0-beta.3

## 1.0.0-beta.2

### Minor Changes

- ac3c152: Prefer explicitly selected provider descriptors over descriptor-level provider preferences and defaults, and expose a Lorion source export condition for workspace playground development.
- ac3c152: Expose runtime-safe extension discovery, catalog, entry map, and bootstrap helpers through `@lorion-org/nuxt/extensions`.
- ac3c152: Add shared capability selection seed defaults for framework adapters.

### Patch Changes

- ac3c152: Expose extension helpers through documented subpaths, register selected extensions as Nuxt layers instead of hand-mounting individual folders, and point public package entries directly at the structured source entrypoints.

  This keeps Nuxt extension activation aligned with descriptor selection while preserving public imports for runtime config and extension helpers.

- ac3c152: Respect host Nuxt import scanning for generated runtime-config composables and add typed explicit import paths for hosts with auto-import scanning disabled.
- Updated dependencies [ac3c152]
- Updated dependencies [ac3c152]
- Updated dependencies [ac3c152]
  - @lorion-org/composition-graph@1.0.0-beta.2
  - @lorion-org/descriptor-discovery@1.0.0-beta.2
  - @lorion-org/provider-selection@1.0.0-beta.2
  - @lorion-org/runtime-config@1.0.0-beta.1
  - @lorion-org/runtime-config-node@1.0.0-beta.1

## 1.0.0

### Minor Changes

- 23a50f0: Add the initial Nuxt module with runtime-config support and layer-extension bootstrap.

  The module discovers local extension descriptors, resolves selected and base descriptors through LORION package primitives, loads selected Nuxt layers, and documents public examples for runtime config and extension composition.

### Patch Changes

- 23a50f0: Expose extension helpers through documented subpaths, register selected extensions as Nuxt layers instead of hand-mounting individual folders, and point public package entries directly at the structured source entrypoints.

  This keeps Nuxt extension activation aligned with descriptor selection while preserving public imports for runtime config and extension helpers.

- Updated dependencies [23a50f0]
- Updated dependencies [23a50f0]
- Updated dependencies [23a50f0]
  - @lorion-org/composition-graph@1.0.0
  - @lorion-org/descriptor-discovery@1.0.0
  - @lorion-org/provider-selection@1.0.0

## 1.0.0-beta.0

- Initial beta package.
