---
'@lorion-org/descriptor-discovery': major
'@lorion-org/nuxt': major
---

One descriptor schema for every host, and a schema for the bundle manifest.

`bundles`, `providerPreferences`, `runtimeConfig` and `publicRuntimeConfig` are core descriptor fields: `bundles` is what `nestedField` expands, `providerPreferences` is read by `@lorion-org/provider-selection`, and `runtimeConfig` is read by both host adapters. Only the Nuxt adapter's copy of the schema described them, so every other host accepted them through `additionalProperties` without describing them, and that copy had already drifted: it allowed `runtimeConfig` only as an object, while both adapters also accept the bare mode string.

- `descriptorSchema` declares all four fields. `bundles` is recursive and `runtimeConfig` accepts a mode or `{ validation }`.
- `bundleManifestSchema` states the manifest wrapper: `bundles` is required, a `$schema` pointer is allowed, and nothing else is. `loadBundleManifest` validates against it, so a run-wide key in a grouping file is reported instead of silently ignored.
  Descriptors that beta.6 accepted can now fail validation: the four fields were previously unconstrained through `additionalProperties`, and each now has a shape. A `runtimeConfig` carrying keys beside `validation`, a `providerPreferences` whose values are not strings, or a non-array `bundles` are rejected at discovery. The error names the offending key.

- `@lorion-org/nuxt` validates against the shared schema. `@lorion-org/nuxt/descriptor-schema` now exports `descriptorSchema`; the forked `nuxtExtensionDescriptorSchema` is gone, and a host that extended it spreads `descriptorSchema` instead. The `$defs` are renamed with it: a host reaching into `$defs.extension` reads `$defs.descriptor`, alongside `semver`, `dependencyMap` and `runtimeConfigValidationMode`. An extension that re-adds `bundles`, `providerPreferences`, `runtimeConfig` or `publicRuntimeConfig` can drop those; they are core fields now, and re-declaring `runtimeConfig` as an object alone rejects the mode string the adapters accept.
