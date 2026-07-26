# @lorion-org/capability-composition

## 1.0.0-beta.7

### Major Changes

- c2de85f: One composition option contract, accepted by every adapter.

  Each host adapter maintained its own option list beside the core's, with nothing linking them, so an option lived wherever its first consumer needed it: the React loader had bundle manifests, virtual descriptors and a selection policy that Nuxt could not reach, while Nuxt had descriptor path globs and a configurable descriptor schema that React could not reach. `composeCapabilities` restated the list a third time and had already fallen behind `resolveCapabilitySelection` by two options, so a runtime composition silently resolved a different set than the build-time one for the same input.
  - `CapabilitySelectionInput` is the one contract. It gains `descriptorPaths`, `descriptorSchema` and `relationDescriptors`, all of which the discovery and selection packages already supported but no host could reach through the core.
  - `composeCapabilities` takes `CapabilityCompositionInput` (the selection input plus the surface, loader and register hooks) and forwards it whole, so a runtime composition resolves exactly what the build-time one does.
  - `CapabilityLoaderOptions` (React) and `NuxtExtensionModuleOptions` (Nuxt) derive their shared half from `CapabilitySelectionInput`. React gains `descriptorPaths` and `descriptorSchema`; Nuxt gains `bundles`, `virtualDescriptors`, `capabilitiesDir`, `policy` and a configurable `nestedField`. A conformance test in each adapter states the requirement, so an option the core gains cannot be dropped silently.
  - Nuxt addresses a nested descriptor at a synthetic directory, as the React path already does. A grouping declared inside another extension's descriptor no longer inherits its host's directory, so it can no longer register that host's app, config or server dirs as a layer.

- 2aa5ba1: Publish the provider outcome of a composition. `resolveCapabilitySelection` returns the resolved capabilities together with the `ProviderSelectionResolution`: which provider won each contested capability, in which mode, the candidates and the providers that lost. `selectDescriptorsWithProviders` and `describeProviderSelection` expose the same for descriptor selection.

  The Nuxt adapter already published this; a React host had to re-derive the winner from the resolved set, which loses `mode` and `excludedProviderIds` and costs a second resolution. `resolveSelectedCapabilities` and `selectDescriptors` keep returning the plain set.

  The outcome describes the composed set, not the discovered one: a host that names an artifact after the winning provider must not be handed a provider this composition never activates. `selectDescriptorsWithProviders` also returns the `catalog` it resolved against, so a host that inspects the graph reads it there instead of building a second one from the same descriptors.

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

- e9c6ed4: Let Changesets own the npm dist-tag.

  The release workflow set `NPM_CONFIG_TAG=beta` and the docs said prereleases therefore land on the `beta` tag instead of `latest`. Neither held: `changeset publish` computes the tag and passes it to npm as an explicit `--tag`, which wins over npm config, and while a package has no stable release it deliberately publishes to `latest` so a plain install resolves. The result was a `beta` tag pointing at an older version than `latest`, which is the opposite of what a consumer expects from a prerelease channel. The workflow now sets no tag and the release documentation states what actually happens.

- Updated dependencies [4ac0aaf]
- Updated dependencies [1c263f1]
- Updated dependencies [6ad426a]
- Updated dependencies [4ac0aaf]
- Updated dependencies [4ac0aaf]
- Updated dependencies [2aa5ba1]
- Updated dependencies [6ad426a]
- Updated dependencies [6ad426a]
- Updated dependencies [4ac0aaf]
- Updated dependencies [4ac0aaf]
- Updated dependencies [6ad426a]
- Updated dependencies [4ac0aaf]
- Updated dependencies [6ad426a]
- Updated dependencies [1c263f1]
  - @lorion-org/descriptor-discovery@1.0.0-beta.7
  - @lorion-org/composition-graph@1.0.0-beta.7
  - @lorion-org/descriptor-selection@1.0.0-beta.7
  - @lorion-org/runtime-config@1.0.0-beta.7
  - @lorion-org/surface-activation@1.0.0-beta.7

## 1.0.0-beta.6

### Minor Changes

- c549690: Add a batteries-included path for grouping capabilities into bundles without one filesystem package per group, so a host needs no bundling code of its own:
  - `virtualDescriptors` on `resolveSelectedCapabilities`, `composeCapabilities` and the React `capabilityLoader`: host-provided descriptors that join the discovered set for graph resolution without living on disk. Grouping descriptors whose `dependencies` point at real capabilities take part in selection but carry no surface, so they emit no import and need no `package.json`.
  - `loadBundleManifest({ cwd, fileName? })` in `@lorion-org/descriptor-discovery`: discovers a declarative bundle manifest (`{ base, default, bundles: [ { id, version, dependencies } ] }` — `bundles` is a nested list of ordinary descriptors, no bespoke format) by walking up from `cwd` and expands it into virtual descriptors plus the base/default seed. Each bundle descriptor is validated against the shared `descriptorSchema`, so a malformed grouping fails fast.
  - `bundles: { cwd, fileName? }` on `composeCapabilities`, `resolveSelectedCapabilities` and the React `capabilityLoader`: the convenience wrapper that loads a manifest and fills `virtualDescriptors`, `baseDescriptors` and `defaultSelection`. Explicit values still win.
  - `virtualDescriptorDirectory(workspaceRoot, id)` / `VIRTUAL_DESCRIPTOR_DIR` in `@lorion-org/descriptor-discovery`: the single shared convention for the synthetic directory a virtual descriptor is addressed at, so the runtime and build-time hosts no longer each hard-code the segment.
  - `baseSeed` on the selection seed (`@lorion-org/descriptor-selection`, forwarded by `capability-composition` and `react`): a CLI/env override for `baseDescriptors`, symmetric to `selectionSeed`. A non-empty parse replaces `baseDescriptors`; otherwise `baseDescriptors` stands. `resolveBaseSelection` is exported for hosts that need the resolved base directly.

- 7450d75: Add a batteries-included workspace loader so a Node/Bun runtime host needs no bespoke plumbing to satisfy `composeCapabilities`' `load` callback:
  - `createWorkspaceLoad({ workspaceRoot, packagesDir? })` in `@lorion-org/capability-composition`: builds a `load` callback that imports a workspace package from `<workspaceRoot>/<packagesDir>/<folder>` through its declared `exports` (a string target, a subpath map, or the conditions-only `.` sugar, with conditional objects resolved in `import` > `require` > `default` order; the `types` condition is never followed, and a specifier/target that escapes the packages directory is rejected). `packagesDir` defaults to `'packages'`. It is the runtime counterpart to build-time workspace source aliases and carries no product specifics.
  - `resolveWorkspaceRoot(from, { markers? })` in `@lorion-org/capability-composition`: walks up from `from` (a file URL such as `import.meta.url`, or a path) until a directory holds all `markers` (default `['packages']`), throwing a clear error otherwise.
  - `findUp(fromDir, matches)` in `@lorion-org/descriptor-discovery`: the shared upward-directory-walk primitive now backing manifest discovery and workspace-root resolution, so the ascent is defined once instead of re-implemented per host.

### Patch Changes

- Updated dependencies [c549690]
- Updated dependencies [7450d75]
  - @lorion-org/descriptor-discovery@1.0.0-beta.6
  - @lorion-org/descriptor-selection@1.0.0-beta.6
  - @lorion-org/composition-graph@1.0.0-beta.6
  - @lorion-org/surface-activation@1.0.0-beta.6

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
