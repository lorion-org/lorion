---
'@lorion-org/surface-activation': minor
'@lorion-org/capability-composition': minor
'@lorion-org/react': patch
---

Extract the framework-free surface-addressing convention (`conventionActivation`, `resolveSurfaceModules`, `capabilitySpecifier`, and the surface types) into a new `@lorion-org/surface-activation` package so build-time and runtime hosts share one addressing seam. `@lorion-org/capability-composition` depends on it and re-exports only `conventionActivation` (the companion its `composeCapabilities` callers need to build the activation they pass in); the build-time addressing tools (`resolveSurfaceModules`, `capabilitySpecifier`) are owned solely by the new package, so a build-time host depends on the light package directly rather than pulling in the runtime host. `@lorion-org/react` consumes `capabilitySpecifier` from `@lorion-org/surface-activation` instead of reimplementing the specifier rule, and drops its unused `@lorion-org/capability-composition` dependency.
