# @lorion-org/descriptor-discovery

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
