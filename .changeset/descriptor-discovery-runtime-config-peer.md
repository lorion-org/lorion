---
'@lorion-org/descriptor-discovery': major
---

`@lorion-org/descriptor-discovery` peers on `@lorion-org/runtime-config`.

`SchemaDescriptor` types `runtimeConfig` and `publicRuntimeConfig` with the types of the package that owns them, so the emitted declarations import from it. Install it alongside `@lorion-org/descriptor-discovery`; every `@lorion-org` package that depends on discovery already carries it.
