---
'@lorion-org/react': major
---

Keep the code generators out of the published surface.

`renderCapabilityModule`, `renderRuntimeConfigModule` and `renderServerRuntimeConfigModule` were exported from `@lorion-org/react/vite`. They write the text of the virtual modules the loader emits, which is an implementation of the loader and not something a host calls, and publishing them froze that text into the contract. They move to an internal module. A host that reached for them was reading generated code rather than calling an API; what the loader emits is described by the loader's own options.
