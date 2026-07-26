# @lorion-org/nuxt

## 1.0.0-beta.7

### Major Changes

- c2de85f: One composition option contract, accepted by every adapter.

  Each host adapter maintained its own option list beside the core's, with nothing linking them, so an option lived wherever its first consumer needed it: the React loader had bundle manifests, virtual descriptors and a selection policy that Nuxt could not reach, while Nuxt had descriptor path globs and a configurable descriptor schema that React could not reach. `composeCapabilities` restated the list a third time and had already fallen behind `resolveCapabilitySelection` by two options, so a runtime composition silently resolved a different set than the build-time one for the same input.
  - `CapabilitySelectionInput` is the one contract. It gains `descriptorPaths`, `descriptorSchema` and `relationDescriptors`, all of which the discovery and selection packages already supported but no host could reach through the core.
  - `composeCapabilities` takes `CapabilityCompositionInput` (the selection input plus the surface, loader and register hooks) and forwards it whole, so a runtime composition resolves exactly what the build-time one does.
  - `CapabilityLoaderOptions` (React) and `NuxtExtensionModuleOptions` (Nuxt) derive their shared half from `CapabilitySelectionInput`. React gains `descriptorPaths` and `descriptorSchema`; Nuxt gains `bundles`, `virtualDescriptors`, `capabilitiesDir`, `policy` and a configurable `nestedField`. A conformance test in each adapter states the requirement, so an option the core gains cannot be dropped silently.
  - Nuxt addresses a nested descriptor at a synthetic directory, as the React path already does. A grouping declared inside another extension's descriptor no longer inherits its host's directory, so it can no longer register that host's app, config or server dirs as a layer.

- 4ac0aaf: Mark a nested descriptor as such. `DiscoveredDescriptor` gains `nested`, true for a descriptor declared inside another descriptor's nested field. It shares the host's directory but owns no package there, so `resolveSelectedCapabilities` now addresses it like any other grouping: a synthetic directory, an empty package name and no surface. Without this a grouping declared next to its host counted as a package and could resolve the host's surface marker as its own.

  `nested` is a required property of `DiscoveredDescriptor`, so a host that builds one by hand declares it. Every host now applies the same treatment: the React loader gives a nested grouping a synthetic directory, an empty package name and no activation, and the Nuxt adapter keeps one out of layer registration whatever its host's directory contains. Both previously read the host's package and surface, which emitted an import of an export that does not exist.

- 4ac0aaf: One typed descriptor, held to the schema at compile time.

  A descriptor's shape was declared four times: the graph type, the shared JSON schema, the Nuxt adapter's own descriptor type and a private manifest type. They had already drifted, and the drift was invisible because `Descriptor` carries an index signature: every field the schema declared but no type did was reachable only as `unknown`, so each use site cast instead of failing.
  - `SchemaDescriptor` in `@lorion-org/descriptor-discovery` is the descriptor as the shared schema describes it: the graph fields plus `bundles`, `providerPreferences`, `runtimeConfig` and `publicRuntimeConfig`, typed by the packages that own them. The casts at the selection, React and Nuxt use sites are gone.
  - `DescriptorField` lists the declared fields and is checked against `descriptor.schema.json` at compile time, in both directions. A field added to the JSON no longer compiles until it is declared, and vice versa.
  - `NuxtExtensionDescriptor` is `SchemaDescriptor`. It described the same four fields, with `runtimeConfig` narrower than the code accepts.
  - `loadBundleManifest` states no manifest type of its own: `bundles.schema.json` is the definition, validated once, narrowed once.

- 6ad426a: One selection seed, one selection brain.

  The seed shape was declared in five places and had already diverged: the copy in `@lorion-org/capability-composition` was missing `key`, and the Nuxt adapter accepted a comma-separated string where the core takes a list. The Nuxt adapter also rebuilt the selection pipeline instead of calling it, so two guards applied on one host and not the other for the very same descriptors.
  - `CapabilitySelectionSeed` is `DescriptorSelectionSeed`, owned by the package that resolves it. `selectionSeed.key` is now typeable everywhere it works.
  - `NuxtExtensionModuleOptions` takes the core spelling: `baseDescriptors` replaces `baseExtensions`, and `selected`, `defaultSelection` and `baseDescriptors` take lists. The callback form of `baseExtensions` is gone, so a host that derived its base from the discovered set computes the list before passing it in:

    ```ts
    // before: the module called this after discovery and selection
    baseExtensions: ({ descriptors, selectedExtensions }) => pickBase(descriptors, selectedExtensions),

    // after: discover and resolve the selection first, then pass a list
    import { discoverDescriptors } from '@lorion-org/descriptor-discovery';
    import { resolveDescriptorSelection } from '@lorion-org/descriptor-selection';

    const discovered = discoverDescriptors({ cwd, descriptorPaths });
    const selected = resolveDescriptorSelection({ defaultSelection, selectionSeed });
    const baseDescriptors = pickBase(discovered.map((entry) => entry.descriptor), selected);
    ```

    A host that only needs the discovered set can call `discoverDescriptors` alone; `resolveDescriptorSelection` is needed only when the base depends on what was selected.

  - The Nuxt adapter resolves through `selectDescriptorsWithProviders`. A `disabled` descriptor is no longer resolvable there, and a selection naming two providers of one capability now fails, both as they already did on every other host.
  - Resolved items are returned ordered by id rather than in discovery order, so two hosts reading the same workspace agree on the order they mount, register or layer in. It is not dependency order: a host that needs its dependencies first sorts for that itself.
  - The Nuxt bootstrap's `selectedExtensions` and `baseExtensionIds` keep the deduplication and ordering they had, which the published `publicRuntimeConfig.extensionSelection` carries.

- 4ac0aaf: One descriptor schema for every host, and a schema for the bundle manifest.

  `bundles`, `providerPreferences`, `runtimeConfig` and `publicRuntimeConfig` are core descriptor fields: `bundles` is what `nestedField` expands, `providerPreferences` is read by `@lorion-org/provider-selection`, and `runtimeConfig` is read by both host adapters. Only the Nuxt adapter's copy of the schema described them, so every other host accepted them through `additionalProperties` without describing them, and that copy had already drifted: it allowed `runtimeConfig` only as an object, while both adapters also accept the bare mode string.
  - `descriptorSchema` declares all four fields. `bundles` is recursive and `runtimeConfig` accepts a mode or `{ validation }`.
  - `bundleManifestSchema` states the manifest wrapper: `bundles` is required, a `$schema` pointer is allowed, and nothing else is. `loadBundleManifest` validates against it, so a run-wide key in a grouping file is reported instead of silently ignored.
    Descriptors that beta.6 accepted can now fail validation: the four fields were previously unconstrained through `additionalProperties`, and each now has a shape. A `runtimeConfig` carrying keys beside `validation`, a `providerPreferences` whose values are not strings, or a non-array `bundles` are rejected at discovery. The error names the offending key.
  - `@lorion-org/nuxt` validates against the shared schema. `@lorion-org/nuxt/descriptor-schema` now exports `descriptorSchema`; the forked `nuxtExtensionDescriptorSchema` is gone, and a host that extended it spreads `descriptorSchema` instead. The `$defs` are renamed with it: a host reaching into `$defs.extension` reads `$defs.descriptor`, alongside `semver`, `dependencyMap` and `runtimeConfigValidationMode`. An extension that re-adds `bundles`, `providerPreferences`, `runtimeConfig` or `publicRuntimeConfig` can drop those; they are core fields now, and re-declaring `runtimeConfig` as an object alone rejects the mode string the adapters accept.

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

### Patch Changes

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
