# @lorion-org/react

## 1.0.0-beta.6

### Minor Changes

- c549690: Add a batteries-included path for grouping capabilities into bundles without one filesystem package per group, so a host needs no bundling code of its own:
  - `virtualDescriptors` on `resolveSelectedCapabilities`, `composeCapabilities` and the React `capabilityLoader`: host-provided descriptors that join the discovered set for graph resolution without living on disk. Grouping descriptors whose `dependencies` point at real capabilities take part in selection but carry no surface, so they emit no import and need no `package.json`.
  - `loadBundleManifest({ cwd, fileName? })` in `@lorion-org/descriptor-discovery`: discovers a declarative bundle manifest (`{ base, default, bundles: [ { id, version, dependencies } ] }` — `bundles` is a nested list of ordinary descriptors, no bespoke format) by walking up from `cwd` and expands it into virtual descriptors plus the base/default seed. Each bundle descriptor is validated against the shared `descriptorSchema`, so a malformed grouping fails fast.
  - `bundles: { cwd, fileName? }` on `composeCapabilities`, `resolveSelectedCapabilities` and the React `capabilityLoader`: the convenience wrapper that loads a manifest and fills `virtualDescriptors`, `baseDescriptors` and `defaultSelection`. Explicit values still win.
  - `virtualDescriptorDirectory(workspaceRoot, id)` / `VIRTUAL_DESCRIPTOR_DIR` in `@lorion-org/descriptor-discovery`: the single shared convention for the synthetic directory a virtual descriptor is addressed at, so the runtime and build-time hosts no longer each hard-code the segment.
  - `baseSeed` on the selection seed (`@lorion-org/descriptor-selection`, forwarded by `capability-composition` and `react`): a CLI/env override for `baseDescriptors`, symmetric to `selectionSeed`. A non-empty parse replaces `baseDescriptors`; otherwise `baseDescriptors` stands. `resolveBaseSelection` is exported for hosts that need the resolved base directly.

### Patch Changes

- Updated dependencies [c549690]
- Updated dependencies [7450d75]
  - @lorion-org/descriptor-discovery@1.0.0-beta.6
  - @lorion-org/descriptor-selection@1.0.0-beta.6
  - @lorion-org/composition-graph@1.0.0-beta.6
  - @lorion-org/provider-selection@1.0.0-beta.6
  - @lorion-org/runtime-config@1.0.0-beta.6
  - @lorion-org/runtime-config-node@1.0.0-beta.6
  - @lorion-org/surface-activation@1.0.0-beta.6

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
  - @lorion-org/surface-activation@1.0.0-beta.5

## 1.0.0-beta.4

### Patch Changes

- d9c8d90: Separate the `indexRouteFile` hint into its own paragraph in the README so it no longer renders as part of the preceding route-config paragraph.

## 1.0.0-beta.3

### Minor Changes

- 67dcd0f: `capabilityLoader` (and `discoverCapabilities`) accept a `surface: { name, resolver }` option that consumes a `@lorion-org/surface-activation` `conventionActivation` resolver directly for a named surface. A build-time host no longer writes a per-host adapter (`({ capabilityDir, descriptor }) => resolver('web', { directory: capabilityDir, id: descriptor.id })`) to reuse the shared surface convention. The richer `activation` resolver — which also sees the descriptor and package.json — stays available for hosts that need it; pass exactly one of `surface` or `activation` (passing both throws).
- b579529: Add a configurable `activation` resolver to `capabilityLoader`, `discoverCapabilities`, and `discoverSelectedCapabilities`. Hosts can now point a capability's activation at any existing package export by returning a custom `exportSubpath` and `exportName`, instead of the fixed `./capability` subpath and `capability` named export. Returning a nullish activation marks a capability as graph-only: it takes part in dependency resolution (and appears in `resolvedCapabilityIds`) but activates nothing and emits no import. The default behavior is unchanged; a custom activation leaves specifier resolution to the host bundler. `DiscoveredCapability.exportName` and `importSpecifier` are optional for graph-only capabilities, and `entryFile` is optional for host-resolved activations. Also fix the `VitePlugin` type so a `capabilityLoader()` plugin is assignable to Vite's `PluginOption` under `exactOptionalPropertyTypes`.
- e3112f1: Add scoped runtime-config support for React capability applications, including Vite virtual modules, configurable var-dir loading, server-only private config guards, schema parse errors, and React context helpers for public capability config.
- 0b36ee9: Consume `@lorion-org/descriptor-selection` for provider-aware descriptor selection instead of each package re-implementing the same discover→provider-dedup→graph pipeline. The React adapter keeps re-exporting `defaultCapabilityRelationDescriptors`, `createCapabilityCompositionPolicy`, and `defaultCapabilityResolutionRelations` unchanged.

  Behavior changes:
  - The "exactly one `defaultFor` provider per capability" guard now runs in all three adapters (React, Nuxt, and capability-composition). A descriptor set where two providers both declare `defaultFor` the same capability now throws instead of silently resolving both — previously only capability-composition enforced this.
  - `capability-composition`'s `resolveSelectedCapabilities` now excludes descriptors marked `disabled: true`, matching the React and Nuxt adapters.

### Patch Changes

- 86f592e: Extract the framework-free surface-addressing convention (`conventionActivation`, `resolveSurfaceModules`, `capabilitySpecifier`, and the surface types) into a new `@lorion-org/surface-activation` package so build-time and runtime hosts share one addressing seam. `@lorion-org/capability-composition` depends on it and re-exports only `conventionActivation` (the companion its `composeCapabilities` callers need to build the activation they pass in); the build-time addressing tools (`resolveSurfaceModules`, `capabilitySpecifier`) are owned solely by the new package, so a build-time host depends on the light package directly rather than pulling in the runtime host. `@lorion-org/react` consumes `capabilitySpecifier` from `@lorion-org/surface-activation` instead of reimplementing the specifier rule, and drops its unused `@lorion-org/capability-composition` dependency.
- Updated dependencies [54a1b8a]
- Updated dependencies [cc32ed2]
- Updated dependencies [04d2ee5]
- Updated dependencies [86f592e]
  - @lorion-org/descriptor-selection@1.0.0-beta.3
  - @lorion-org/surface-activation@1.0.0-beta.3
  - @lorion-org/descriptor-discovery@1.0.0-beta.3

## 1.0.0-beta.2

### Minor Changes

- ac3c152: Prefer explicitly selected provider descriptors over descriptor-level provider preferences and defaults, and expose a Lorion source export condition for workspace playground development.
- ac3c152: Add default capability relation policy, provider-owned defaults, and default selection support for React capability composition.
- ac3c152: Add shared capability selection seed defaults for framework adapters.

### Patch Changes

- Updated dependencies [ac3c152]
- Updated dependencies [ac3c152]
- Updated dependencies [ac3c152]
  - @lorion-org/composition-graph@1.0.0-beta.2
  - @lorion-org/descriptor-discovery@1.0.0-beta.2
  - @lorion-org/provider-selection@1.0.0-beta.2

## 1.0.0

### Minor Changes

- 23a50f0: Introduce the React capability runtime package with immutable contribution contracts, React context helpers, provider selection helpers, and Vite integration for descriptor-based capability applications.

  The package adds the `@lorion-org/react` and `@lorion-org/react/vite` entry points, virtual capability loading, TanStack-compatible route config generation, tests, documentation, and a React playground with demo shops and payment providers.

### Patch Changes

- Updated dependencies [23a50f0]
- Updated dependencies [23a50f0]
- Updated dependencies [23a50f0]
  - @lorion-org/composition-graph@1.0.0
  - @lorion-org/descriptor-discovery@1.0.0
  - @lorion-org/provider-selection@1.0.0

## 1.0.0-beta.0

- Initial beta package.
