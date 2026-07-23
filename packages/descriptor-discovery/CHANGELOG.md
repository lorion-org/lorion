# @lorion-org/descriptor-discovery

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
