# @lorion-org/react

## 1.0.0-beta.7

### Major Changes

- c2de85f: One composition option contract, accepted by every adapter.

  Each host adapter maintained its own option list beside the core's, with nothing linking them, so an option lived wherever its first consumer needed it: the React loader had bundle manifests, virtual descriptors and a selection policy that Nuxt could not reach, while Nuxt had descriptor path globs and a configurable descriptor schema that React could not reach. `composeCapabilities` restated the list a third time and had already fallen behind `resolveCapabilitySelection` by two options, so a runtime composition silently resolved a different set than the build-time one for the same input.
  - `CapabilitySelectionInput` is the one contract. It gains `descriptorPaths`, `descriptorSchema` and `relationDescriptors`, all of which the discovery and selection packages already supported but no host could reach through the core.
  - `composeCapabilities` takes `CapabilityCompositionInput` (the selection input plus the surface, loader and register hooks) and forwards it whole, so a runtime composition resolves exactly what the build-time one does.
  - `CapabilityLoaderOptions` (React) and `NuxtExtensionModuleOptions` (Nuxt) derive their shared half from `CapabilitySelectionInput`. React gains `descriptorPaths` and `descriptorSchema`; Nuxt gains `bundles`, `virtualDescriptors`, `capabilitiesDir`, `policy` and a configurable `nestedField`. A conformance test in each adapter states the requirement, so an option the core gains cannot be dropped silently.
  - Nuxt addresses a nested descriptor at a synthetic directory, as the React path already does. A grouping declared inside another extension's descriptor no longer inherits its host's directory, so it can no longer register that host's app, config or server dirs as a layer.

- 6ad426a: A bundle manifest declares descriptors and nothing else, and the always-on base is named by the host.

  A manifest groups descriptors on a package and feature basis, so a run-wide seed does not belong in it: `base` and `default` named one base floor and one default selection for every host that reads the file, which a layered or multi-product setup cannot satisfy. The host already owns `baseDescriptors` and `defaultSelection`, and naming them there lets one manifest serve runs that seed it differently.
  - `loadBundleManifest({ cwd, fileName? })` returns the declared `Descriptor[]`. The manifest format is `{ bundles: [ { id, version, dependencies } ] }`; `base` and `default` are gone, as is the `BundleManifest` type. A host that read them moves both into its seed.
  - `bundles: { cwd, fileName? }` on `resolveSelectedCapabilities`, `composeCapabilities` and the React `capabilityLoader` adds the declared groupings to `virtualDescriptors` and no longer fills any seed.
  - `baseSeed` and `resolveBaseSelection` are removed from `@lorion-org/descriptor-selection` and from the seeds `capability-composition` and `react` forward. The always-on base is what a host composes around, so swapping it per run described a different composition rather than a variant of one; `baseDescriptors` stands on its own.

  A host that exposed the base as a CLI or environment override owns the parse now:

  ```ts
  import { resolveDescriptorSelectionSeed } from '@lorion-org/composition-graph';

  const named = resolveDescriptorSelectionSeed({ argv: process.argv, env: process.env, key: 'base' });
  const seed = { baseDescriptors: named.length ? named : ['platform'], selected: [...] };
  ```

- 4ac0aaf: Mark a nested descriptor as such. `DiscoveredDescriptor` gains `nested`, true for a descriptor declared inside another descriptor's nested field. It shares the host's directory but owns no package there, so `resolveSelectedCapabilities` now addresses it like any other grouping: a synthetic directory, an empty package name and no surface. Without this a grouping declared next to its host counted as a package and could resolve the host's surface marker as its own.

  `nested` is a required property of `DiscoveredDescriptor`, so a host that builds one by hand declares it. Every host now applies the same treatment: the React loader gives a nested grouping a synthetic directory, an empty package name and no activation, and the Nuxt adapter keeps one out of layer registration whatever its host's directory contains. Both previously read the host's package and surface, which emitted an import of an export that does not exist.

- a52246c: Remove `CapabilitySelectionSeedOptions` from `@lorion-org/react/vite`.

  It was a local alias of the seed-options shape and unreferenced even inside this package, while the loader typed `selectionSeed` through the core's copy — which was missing `key`. The seed contract now has one declaration, so the alias has nothing left to name. A consumer that imported it uses `Omit<DescriptorSelectionSeedInput, 'defaultValue'>` from `@lorion-org/composition-graph`, which is what it aliased.

  `CapabilityManifest` in `@lorion-org/react` is now `SchemaDescriptor`. It described the same descriptor fields a fifth time, with `runtimeConfig` narrower than the code accepts and a `description` field no schema declares; a host attaching its own data still can, through the descriptor's index signature.

### Minor Changes

- 2aa5ba1: Describe and render a composition, once, for every host.

  Only the Nuxt adapter could report on a resolution; a build-time host had nothing and wrote its own. Two independent formatters then described the same resolution, and a third host would have written a third — the shape that let a loader compose 50 capabilities while the report said 47.
  - `describeComposition({ resolved, discovered, requested?, selected?, base?, providers? })` returns a `CompositionReport`, stated in descriptor ids alone: what was asked for, what the selection resolved to, the always-on base, the winner and mode of each contested capability, the activated set and everything discovery found. Whether a descriptor is a package on disk, a mounted layer or a manifest grouping is a host's own view, so a host that reports on that filters before it describes. Every id list is deduplicated and sorted, so two reports of one run compare as equal text.
  - `discovered` is required. Defaulting it to `resolved` would make the `n/m` count claim that nothing was left out, which is the failure the report exists to prevent.
  - A provider entry carries `resolved`. A winner that is not part of the composition is reported as such rather than dropped: dropping it hides a host that configured a provider the run never built.
  - `notResolved(report)` names what the workspace holds and this composition leaves out.
  - `formatCompositionReport(report, { palette?, width?, leadingRows? })` renders it as lines: an aligned key column for what was asked and what won each contested capability, then one hanging block per descriptor set, hard-wrapped so a terminal never soft-wraps it. Colour stays with the host through the palette, which names one role per thing a reader distinguishes (`label`, `accent`, `id`, `muted`), and `leadingRows` lets a host add its own rows to the same key column.
  - `resolveCapabilitySelection` additionally returns `discovered`, every descriptor id the run knew about. Counting directories instead misses nested descriptors and manifest groupings.
  - `formatNuxtExtensionBootstrapLog` renders that shared report, so the Nuxt adapter is a renderer rather than the only host with a reporter. Its output is a block of aligned rows where it was one line per fact, so a snapshot of it needs updating. `NuxtExtensionBootstrap` gains `requestedExtensions`, the ids a run asked for or null when it took the default, which the log reports instead of always claiming the default selection.
  - `describeCapabilityComposition(workspaceRoot, options)` is the build-time equal in `@lorion-org/react/vite`: it resolves the loader's own options and returns the same `CompositionReport`, groupings and provider outcome included. A React host can now report on a composition without rebuilding the resolution, which only the Nuxt adapter could do.

- a52246c: Expand nested descriptors in the capability path. `resolveSelectedCapabilities`, `resolveCapabilitySelection` and the React `capabilityLoader` accept `nestedField`, the field in a discovered `capability.json` that holds further descriptors. A capability that groups others declares them next to itself instead of in a separate bundle manifest, which is what the Nuxt adapter already does through `discoverDescriptors`.

### Patch Changes

- 4ac0aaf: One typed descriptor, held to the schema at compile time.

  A descriptor's shape was declared four times: the graph type, the shared JSON schema, the Nuxt adapter's own descriptor type and a private manifest type. They had already drifted, and the drift was invisible because `Descriptor` carries an index signature: every field the schema declared but no type did was reachable only as `unknown`, so each use site cast instead of failing.
  - `SchemaDescriptor` in `@lorion-org/descriptor-discovery` is the descriptor as the shared schema describes it: the graph fields plus `bundles`, `providerPreferences`, `runtimeConfig` and `publicRuntimeConfig`, typed by the packages that own them. The casts at the selection, React and Nuxt use sites are gone.
  - `DescriptorField` lists the declared fields and is checked against `descriptor.schema.json` at compile time, in both directions. A field added to the JSON no longer compiles until it is declared, and vice versa.
  - `NuxtExtensionDescriptor` is `SchemaDescriptor`. It described the same four fields, with `runtimeConfig` narrower than the code accepts.
  - `loadBundleManifest` states no manifest type of its own: `bundles.schema.json` is the definition, validated once, narrowed once.

- Updated dependencies [c2de85f]
- Updated dependencies [4ac0aaf]
- Updated dependencies [1c263f1]
- Updated dependencies [2aa5ba1]
- Updated dependencies [6ad426a]
- Updated dependencies [4ac0aaf]
- Updated dependencies [4ac0aaf]
- Updated dependencies [2aa5ba1]
- Updated dependencies [6ad426a]
- Updated dependencies [6ad426a]
- Updated dependencies [4ac0aaf]
- Updated dependencies [a52246c]
- Updated dependencies [4ac0aaf]
- Updated dependencies [6ad426a]
- Updated dependencies [e9c6ed4]
- Updated dependencies [4ac0aaf]
- Updated dependencies [6ad426a]
- Updated dependencies [1c263f1]
  - @lorion-org/capability-composition@1.0.0-beta.7
  - @lorion-org/descriptor-discovery@1.0.0-beta.7
  - @lorion-org/composition-graph@1.0.0-beta.7
  - @lorion-org/descriptor-selection@1.0.0-beta.7
  - @lorion-org/provider-selection@1.0.0-beta.7
  - @lorion-org/runtime-config@1.0.0-beta.7
  - @lorion-org/runtime-config-node@1.0.0-beta.7
  - @lorion-org/surface-activation@1.0.0-beta.7

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
