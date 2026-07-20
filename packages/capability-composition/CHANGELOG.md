# @lorion-org/capability-composition

## 1.0.0-beta.5

### Patch Changes

- 5246ab8: Adopt unified versioning: all `@lorion-org/*` packages now share a single version and are released together, so a given release line is consistent across the whole surface.
- Updated dependencies [5246ab8]
  - @lorion-org/composition-graph@1.0.0-beta.5
  - @lorion-org/descriptor-discovery@1.0.0-beta.5
  - @lorion-org/descriptor-selection@1.0.0-beta.5
  - @lorion-org/surface-activation@1.0.0-beta.5

## 1.0.0-beta.3

### Minor Changes

- 0b36ee9: Add `resolveSurfaceModules(active, surface, activation)`, the shared seam between the two host styles: the runtime loop (`composeCapabilities`) feeds each resolved specifier to a dynamic `load`, while a build-time host code-generates static imports from the same list. This makes build-time server composition a first-class path (no need to re-derive the module specifier), and `composeCapabilities` now builds on it. The specifier derivation also tolerates an export subpath without a leading `.`.
- 760bccf: Add `@lorion-org/capability-composition`, a framework-free package for composing descriptor-defined capabilities over the LORION core. It exposes `resolveSelectedCapabilities` (discovery, dependency-graph selection, provider selection, and seeding), `conventionActivation` (configurable file-marker and export-name detection), and `composeCapabilities` (a registry-agnostic discover, select, activate, and register loop). Hosts reuse one composition path and supply only their activation convention and registration.
- 86f592e: Extract the framework-free surface-addressing convention (`conventionActivation`, `resolveSurfaceModules`, `capabilitySpecifier`, and the surface types) into a new `@lorion-org/surface-activation` package so build-time and runtime hosts share one addressing seam. `@lorion-org/capability-composition` depends on it and re-exports only `conventionActivation` (the companion its `composeCapabilities` callers need to build the activation they pass in); the build-time addressing tools (`resolveSurfaceModules`, `capabilitySpecifier`) are owned solely by the new package, so a build-time host depends on the light package directly rather than pulling in the runtime host. `@lorion-org/react` consumes `capabilitySpecifier` from `@lorion-org/surface-activation` instead of reimplementing the specifier rule, and drops its unused `@lorion-org/capability-composition` dependency.

### Patch Changes

- 0b36ee9: Consume `@lorion-org/descriptor-selection` for provider-aware descriptor selection instead of each package re-implementing the same discover→provider-dedup→graph pipeline. The React adapter keeps re-exporting `defaultCapabilityRelationDescriptors`, `createCapabilityCompositionPolicy`, and `defaultCapabilityResolutionRelations` unchanged.

  Behavior changes:
  - The "exactly one `defaultFor` provider per capability" guard now runs in all three adapters (React, Nuxt, and capability-composition). A descriptor set where two providers both declare `defaultFor` the same capability now throws instead of silently resolving both — previously only capability-composition enforced this.
  - `capability-composition`'s `resolveSelectedCapabilities` now excludes descriptors marked `disabled: true`, matching the React and Nuxt adapters.

- Updated dependencies [54a1b8a]
- Updated dependencies [cc32ed2]
- Updated dependencies [04d2ee5]
- Updated dependencies [86f592e]
  - @lorion-org/descriptor-selection@1.0.0-beta.3
  - @lorion-org/surface-activation@1.0.0-beta.3
  - @lorion-org/descriptor-discovery@1.0.0-beta.3
