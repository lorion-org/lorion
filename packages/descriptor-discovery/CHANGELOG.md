# @lorion-org/descriptor-discovery

## 1.0.0-beta.9

### Minor Changes

- 5788936: Let a host register a relation without replacing the ones a composition already
  walks, and read the declared contribution relation.
  - `RelationDescriptor` carries optional `roles` (`resolution`, `provenance`,
    `inspection`), and `extendCompositionPolicy(policy, relationDescriptors)` appends
    each registered relation to the lists its roles name. A relation without roles is
    registered and walked by nothing, which is what happened before.
  - `providerRelationDescriptors` declares those roles, and
    `selectDescriptorsWithProviders` extends the policy with the relations it carries.
    A policy that named `resolutionRelationIds` to add an edge of its own used to drop
    the provider relation with it, and every default provider lost its slot.
  - `resolveContributions(descriptors, options?)`, `contributionRelationDescriptor()`
    and the descriptor fields `contributionPoints` / `contributesTo`: a descriptor
    offers named points, others declare which of them they fill. A contribution to an
    unknown descriptor, to a point its owner does not declare, or to the contributor
    itself aborts while the declaring descriptor can still be named. Resolution does
    not walk the relation.
  - `assertKnownReferences({ descriptors, relationDescriptors? })` reports a name no
    descriptor declares together with the descriptor that declared it and the relation
    it declared it under. A relation resolves only for a target the descriptor map
    holds, so such a name otherwise shrinks the composition in silence.

- b8c954e: Read the package set of a workspace once, and compose from it.
  - `resolvePackageSources({ from | root, patterns?, additionalRoots?, descriptorFileName?, cache? })`
    in `@lorion-org/descriptor-discovery`: the packages a workspace holds, each with its
    name, root, manifest and the descriptor beside it, plus the `descriptorPaths`
    `discoverDescriptors` takes. Workspace patterns are read in both spellings (a list,
    or an object carrying `packages`), `additionalRoots` joins further checkouts into
    one snapshot with the asking workspace winning a name collision, two packages
    claiming one descriptor id abort with both paths, a descriptor with no manifest
    beside it is named rather than dropped, and a pattern whose prefix names a checkout
    that is not there aborts instead of resolving a composition that is quietly
    incomplete. `findWorkspaceRoot(from)` and `readWorkspacePatterns(manifest)`
    are the pieces it is built from.
  - `resolvePackageExport(exports, subpath)` and `resolvePackageEntries(packageSources, subpaths)`
    in `@lorion-org/descriptor-discovery`: one `exports` resolution (`import` before
    `require` before `default`, conditions-only shorthand included, `types` never
    followed), and the public entries of a package set projected onto the files they
    resolve to. `createWorkspaceLoad` now uses that resolution instead of a second copy
    of it.
  - `createPackageSourceLoad(packageSources)` in `@lorion-org/capability-composition`:
    the `load` callback over a resolved package set rather than one packages directory,
    so packages of several roots and several directory layouts load through one
    callback.
  - `resolveSurfaceEntries({ capabilities, surface, activation, packageSources })` in
    `@lorion-org/capability-composition`: one surface projected onto the files its
    packages declare, for a build-time host that emits static imports. A capability
    whose package is missing from the set, declares no such export, or exports a file
    that is not there aborts by name.

### Patch Changes

- e59fc86: Match a file at the end of a descriptor path pattern, whatever the last segment is.

  A pattern ending in a wildcard already matched files only. A pattern ending in a
  literal segment asked whether the path exists, so a directory carrying the name of
  the descriptor file counted as a match and the read that followed failed with
  `EISDIR` instead of saying what was wrong. Both branches now name a file.

- Updated dependencies [5788936]
  - @lorion-org/composition-graph@1.0.0-beta.9
  - @lorion-org/runtime-config@1.0.0-beta.9

## 1.0.0-beta.8

### Major Changes

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

- Updated dependencies [f0be779]
  - @lorion-org/composition-graph@1.0.0-beta.8
  - @lorion-org/runtime-config@1.0.0-beta.8

## 1.0.0-beta.7

### Major Changes

- 4ac0aaf: Hold a manifest bundle to the same schema as the same grouping declared inside a descriptor.

  `loadBundleManifest` defaulted a missing `version` to `0.0.0` before validating, while the identical grouping under a descriptor's `bundles` field was validated as written and rejected. One spelling accepted what the other refused. Manifest entries are now validated unchanged, so `version` is required in both, as `descriptor.schema.json` says.

- 4ac0aaf: `@lorion-org/descriptor-discovery` peers on `@lorion-org/runtime-config`.

  `SchemaDescriptor` types `runtimeConfig` and `publicRuntimeConfig` with the types of the package that owns them, so the emitted declarations import from it. Install it alongside `@lorion-org/descriptor-discovery`; every `@lorion-org` package that depends on discovery already carries it.

- 4ac0aaf: Report every schema violation of a descriptor, not the first one.

  Validation stopped at the first error, so a descriptor with three broken fields took three runs to fix. It now collects all of them in one pass, and the formatter that a host can replace receives all of them.
  - `DescriptorSchemaValidationErrorFormatter` takes `(target, validationErrors)`, a non-empty readonly array, where it took a single `ErrorObject`. A host with its own `formatError` reads `validationErrors[0]` for the previous behaviour, or maps over the array.
  - The default message lists one line per violation, so the text of an existing message changes even for a single error. A test asserting the exact string needs updating; one matching the offending key keeps working.
  - `DescriptorValidationOptions` takes `label`, what the validated document is called in the message. A manifest wrapper is not a descriptor, and saying so is the difference between a reader looking at the file and a reader looking at a bundle entry. It defaults to `Descriptor`.
  - `NESTED_DESCRIPTOR_FIELD` is exported, the field name (`bundles`) that discovery expands into nested descriptors. A host that passes `nestedField` explicitly can name the default instead of repeating the literal.

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

- 4ac0aaf: One typed descriptor, held to the schema at compile time.

  A descriptor's shape was declared four times: the graph type, the shared JSON schema, the Nuxt adapter's own descriptor type and a private manifest type. They had already drifted, and the drift was invisible because `Descriptor` carries an index signature: every field the schema declared but no type did was reachable only as `unknown`, so each use site cast instead of failing.
  - `SchemaDescriptor` in `@lorion-org/descriptor-discovery` is the descriptor as the shared schema describes it: the graph fields plus `bundles`, `providerPreferences`, `runtimeConfig` and `publicRuntimeConfig`, typed by the packages that own them. The casts at the selection, React and Nuxt use sites are gone.
  - `DescriptorField` lists the declared fields and is checked against `descriptor.schema.json` at compile time, in both directions. A field added to the JSON no longer compiles until it is declared, and vice versa.
  - `NuxtExtensionDescriptor` is `SchemaDescriptor`. It described the same four fields, with `runtimeConfig` narrower than the code accepts.
  - `loadBundleManifest` states no manifest type of its own: `bundles.schema.json` is the definition, validated once, narrowed once.

- 4ac0aaf: One descriptor schema for every host, and a schema for the bundle manifest.

  `bundles`, `providerPreferences`, `runtimeConfig` and `publicRuntimeConfig` are core descriptor fields: `bundles` is what `nestedField` expands, `providerPreferences` is read by `@lorion-org/provider-selection`, and `runtimeConfig` is read by both host adapters. Only the Nuxt adapter's copy of the schema described them, so every other host accepted them through `additionalProperties` without describing them, and that copy had already drifted: it allowed `runtimeConfig` only as an object, while both adapters also accept the bare mode string.
  - `descriptorSchema` declares all four fields. `bundles` is recursive and `runtimeConfig` accepts a mode or `{ validation }`.
  - `bundleManifestSchema` states the manifest wrapper: `bundles` is required, a `$schema` pointer is allowed, and nothing else is. `loadBundleManifest` validates against it, so a run-wide key in a grouping file is reported instead of silently ignored.
    Descriptors that beta.6 accepted can now fail validation: the four fields were previously unconstrained through `additionalProperties`, and each now has a shape. A `runtimeConfig` carrying keys beside `validation`, a `providerPreferences` whose values are not strings, or a non-array `bundles` are rejected at discovery. The error names the offending key.
  - `@lorion-org/nuxt` validates against the shared schema. `@lorion-org/nuxt/descriptor-schema` now exports `descriptorSchema`; the forked `nuxtExtensionDescriptorSchema` is gone, and a host that extended it spreads `descriptorSchema` instead. The `$defs` are renamed with it: a host reaching into `$defs.extension` reads `$defs.descriptor`, alongside `semver`, `dependencyMap` and `runtimeConfigValidationMode`. An extension that re-adds `bundles`, `providerPreferences`, `runtimeConfig` or `publicRuntimeConfig` can drop those; they are core fields now, and re-declaring `runtimeConfig` as an object alone rejects the mode string the adapters accept.

### Minor Changes

- 6ad426a: A capability a descriptor provides for must be declared, and a descriptor may describe itself.

  A mistyped `providesFor` used to open a second capability that nothing requires. The real one then fell back to its default, the mistyped one resolved its provider, and the composition became a different product with no error: one wrong character turned a selected distribution into two. `assertKnownProviderCapabilities` now reports it, naming both the capability and the descriptors that point at it.

  The check runs against every discovered descriptor, not the resolved subset, so a provider whose capability exists elsewhere in the workspace but takes no part in this composition is unaffected. It fails only when nothing in the workspace declares the capability at all.

  A capability is declared like any other descriptor, and needs no package:

  ```json
  { "id": "payment", "version": "0.0.0", "description": "Capability filled by a payment provider." }
  ```

  `description` is now a declared optional field on the descriptor schema. It was already accepted through `additionalProperties`, so it validated nowhere and no editor offered it. A capability slot needs it most: it is an id others provide for and carries nothing else that says what it is.

### Patch Changes

- Updated dependencies [1c263f1]
- Updated dependencies [1c263f1]
  - @lorion-org/composition-graph@1.0.0-beta.7
  - @lorion-org/runtime-config@1.0.0-beta.7

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

- @lorion-org/composition-graph@1.0.0-beta.6

## 1.0.0-beta.5

### Patch Changes

- 5246ab8: Adopt unified versioning: all `@lorion-org/*` packages now share a single version and are released together, so a given release line is consistent across the whole surface.
- Updated dependencies [5246ab8]
  - @lorion-org/composition-graph@1.0.0-beta.5

## 1.0.0-beta.3

### Minor Changes

- 04d2ee5: Add `requirePackageName(packageJson, packageJsonPath)` — validate that an on-disk capability package declares a string `name`, with one shared error message. `@lorion-org/capability-composition` and `@lorion-org/react` now use it instead of each reimplementing the read-and-validate, removing the duplicated logic (and a redundant second validation in the React Vite plugin's activation resolver).

## 1.0.0-beta.2

### Minor Changes

- ac3c152: Prefer explicitly selected provider descriptors over descriptor-level provider preferences and defaults, and expose a Lorion source export condition for workspace playground development.

### Patch Changes

- Updated dependencies [ac3c152]
- Updated dependencies [ac3c152]
- Updated dependencies [ac3c152]
  - @lorion-org/composition-graph@1.0.0-beta.2

## 1.0.0

### Minor Changes

- 23a50f0: Introduce the Node-side descriptor discovery package for reading descriptor documents from disk and normalizing them into the flat descriptor shape consumed by `@lorion-org/composition-graph`.

  The package includes descriptor schema exports, one-level nested descriptor flattening, id and version normalization, package tests, documentation, and package-check support for public publication.

### Patch Changes

- Updated dependencies [23a50f0]
  - @lorion-org/composition-graph@1.0.0

## 1.0.0-beta.0

- Initial beta package.
