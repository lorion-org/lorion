# @lorion-org/surface-activation

## 1.0.0-beta.5

### Patch Changes

- 5246ab8: Adopt unified versioning: all `@lorion-org/*` packages now share a single version and are released together, so a given release line is consistent across the whole surface.

## 1.0.0-beta.3

### Minor Changes

- cc32ed2: Add `fileSurfaceConvention({ files, exportSubpath, exportSuffix?, exists, join? })`, a ready-made `SurfaceConvention` for the common file-layout case: the surface is present when one of `files` exists, and its export is `camelCase(id) + exportSuffix` from `exportSubpath`. It bakes the marker and export-name rule a host would otherwise repeat per surface. Existence is injected (`exists`), so the package stays I/O-free; `join` defaults to a POSIX join. The raw `SurfaceConvention` object stays available for cases the preset does not cover.
- 86f592e: Extract the framework-free surface-addressing convention (`conventionActivation`, `resolveSurfaceModules`, `capabilitySpecifier`, and the surface types) into a new `@lorion-org/surface-activation` package so build-time and runtime hosts share one addressing seam. `@lorion-org/capability-composition` depends on it and re-exports only `conventionActivation` (the companion its `composeCapabilities` callers need to build the activation they pass in); the build-time addressing tools (`resolveSurfaceModules`, `capabilitySpecifier`) are owned solely by the new package, so a build-time host depends on the light package directly rather than pulling in the runtime host. `@lorion-org/react` consumes `capabilitySpecifier` from `@lorion-org/surface-activation` instead of reimplementing the specifier rule, and drops its unused `@lorion-org/capability-composition` dependency.
