# @lorion-org/descriptor-selection

## 1.0.0-beta.8

### Major Changes

- edd8bb9: Model provider choices as active slots whose participation, requirement, and
  selection are independent.
  - A capability with provider candidates may remain active and visibly `unfilled`
    when no resolved descriptor depends on it.
  - Dependencies of resolved descriptors make the capability required; explicit
    and concrete dependency requests still select and require a provider, while a
    default may fill an active non-required slot.
  - Replace the winner-only `selections` map with a serializable, capability-sorted
    `slots` array. Each slot is a `selected` or `unfilled` discriminated state and
    carries its requirement and candidates.
  - Publish the same provider-slot result through composition reports, Nuxt public
    runtime config, and React's `virtual:capabilities` module.

- f0be779: Use one descriptor-native contract for provider selection.
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

### Patch Changes

- Updated dependencies [edd8bb9]
- Updated dependencies [f0be779]
  - @lorion-org/provider-selection@1.0.0-beta.8
  - @lorion-org/composition-graph@1.0.0-beta.8

## 1.0.0-beta.7

### Major Changes

- 6ad426a: A capability a descriptor provides for must be declared, and a descriptor may describe itself.

  A mistyped `providesFor` used to open a second capability that nothing requires. The real one then fell back to its default, the mistyped one resolved its provider, and the composition became a different product with no error: one wrong character turned a selected distribution into two. `assertKnownProviderCapabilities` now reports it, naming both the capability and the descriptors that point at it.

  The check runs against every discovered descriptor, not the resolved subset, so a provider whose capability exists elsewhere in the workspace but takes no part in this composition is unaffected. It fails only when nothing in the workspace declares the capability at all.

  A capability is declared like any other descriptor, and needs no package:

  ```json
  { "id": "payment", "version": "0.0.0", "description": "Capability filled by a payment provider." }
  ```

  `description` is now a declared optional field on the descriptor schema. It was already accepted through `additionalProperties`, so it validated nowhere and no editor offered it. A capability slot needs it most: it is an id others provide for and carries nothing else that says what it is.

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

- 6ad426a: Reject a selection that names more than one provider of the same capability. Both were previously seeded and therefore both resolved, so a host silently composed a capability served twice. `assertSingleSelectedProvider` reports the capability and the competing providers, mirroring `assertSingleDefaultProvider` for descriptor-level defaults, and `selectDescriptors` applies it before provider preferences are resolved.

### Patch Changes

- 6ad426a: Return items ordered by id on every path, including the one that resolves nothing.

  `selectDescriptorsWithProviders` documents a stable id order, but the short circuit for "neither a selection nor a base floor" returned discovery order. A host with no seed and no base therefore mounted in filesystem order while every other host mounted by id, and the order changed when a directory was renamed. The order is a contract of the function, not of the path an input happens to take.

- 4ac0aaf: One typed descriptor, held to the schema at compile time.

  A descriptor's shape was declared four times: the graph type, the shared JSON schema, the Nuxt adapter's own descriptor type and a private manifest type. They had already drifted, and the drift was invisible because `Descriptor` carries an index signature: every field the schema declared but no type did was reachable only as `unknown`, so each use site cast instead of failing.
  - `SchemaDescriptor` in `@lorion-org/descriptor-discovery` is the descriptor as the shared schema describes it: the graph fields plus `bundles`, `providerPreferences`, `runtimeConfig` and `publicRuntimeConfig`, typed by the packages that own them. The casts at the selection, React and Nuxt use sites are gone.
  - `DescriptorField` lists the declared fields and is checked against `descriptor.schema.json` at compile time, in both directions. A field added to the JSON no longer compiles until it is declared, and vice versa.
  - `NuxtExtensionDescriptor` is `SchemaDescriptor`. It described the same four fields, with `runtimeConfig` narrower than the code accepts.
  - `loadBundleManifest` states no manifest type of its own: `bundles.schema.json` is the definition, validated once, narrowed once.

- Updated dependencies [1c263f1]
- Updated dependencies [1c263f1]
  - @lorion-org/composition-graph@1.0.0-beta.7
  - @lorion-org/provider-selection@1.0.0-beta.7

## 1.0.0-beta.6

### Minor Changes

- c549690: Add a batteries-included path for grouping capabilities into bundles without one filesystem package per group, so a host needs no bundling code of its own:
  - `virtualDescriptors` on `resolveSelectedCapabilities`, `composeCapabilities` and the React `capabilityLoader`: host-provided descriptors that join the discovered set for graph resolution without living on disk. Grouping descriptors whose `dependencies` point at real capabilities take part in selection but carry no surface, so they emit no import and need no `package.json`.
  - `loadBundleManifest({ cwd, fileName? })` in `@lorion-org/descriptor-discovery`: discovers a declarative bundle manifest (`{ base, default, bundles: [ { id, version, dependencies } ] }` — `bundles` is a nested list of ordinary descriptors, no bespoke format) by walking up from `cwd` and expands it into virtual descriptors plus the base/default seed. Each bundle descriptor is validated against the shared `descriptorSchema`, so a malformed grouping fails fast.
  - `bundles: { cwd, fileName? }` on `composeCapabilities`, `resolveSelectedCapabilities` and the React `capabilityLoader`: the convenience wrapper that loads a manifest and fills `virtualDescriptors`, `baseDescriptors` and `defaultSelection`. Explicit values still win.
  - `virtualDescriptorDirectory(workspaceRoot, id)` / `VIRTUAL_DESCRIPTOR_DIR` in `@lorion-org/descriptor-discovery`: the single shared convention for the synthetic directory a virtual descriptor is addressed at, so the runtime and build-time hosts no longer each hard-code the segment.
  - `baseSeed` on the selection seed (`@lorion-org/descriptor-selection`, forwarded by `capability-composition` and `react`): a CLI/env override for `baseDescriptors`, symmetric to `selectionSeed`. A non-empty parse replaces `baseDescriptors`; otherwise `baseDescriptors` stands. `resolveBaseSelection` is exported for hosts that need the resolved base directly.

### Patch Changes

- @lorion-org/composition-graph@1.0.0-beta.6
- @lorion-org/provider-selection@1.0.0-beta.6

## 1.0.0-beta.5

### Patch Changes

- 5246ab8: Adopt unified versioning: all `@lorion-org/*` packages now share a single version and are released together, so a given release line is consistent across the whole surface.
- Updated dependencies [5246ab8]
  - @lorion-org/composition-graph@1.0.0-beta.5
  - @lorion-org/provider-selection@1.0.0-beta.5

## 1.0.0-beta.3

### Minor Changes

- 54a1b8a: Add `@lorion-org/descriptor-selection`, a framework-free, provider-aware descriptor selection package. Given items that each carry a descriptor and a selection seed, it resolves the active subset — parsing the seed, applying one-provider-per-capability selection, and resolving the dependency graph. It exposes `selectDescriptors`, `applyProviderSelection`, `resolveDescriptorSelection`, `assertSingleDefaultProvider`, and the shared `providerRelationDescriptors` / `defaultResolutionRelations` / `descriptorSelectionPolicy`. It is the single selection brain reused by the React and Nuxt adapters and by `@lorion-org/capability-composition`.
