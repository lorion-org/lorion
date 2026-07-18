---
'@lorion-org/capability-composition': minor
---

Add `resolveSurfaceModules(active, surface, activation)`, the shared seam between the two host styles: the runtime loop (`composeCapabilities`) feeds each resolved specifier to a dynamic `load`, while a build-time host code-generates static imports from the same list. This makes build-time server composition a first-class path (no need to re-derive the module specifier), and `composeCapabilities` now builds on it. The specifier derivation also tolerates an export subpath without a leading `.`.
