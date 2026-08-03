---
'@lorion-org/descriptor-discovery': major
'@lorion-org/nuxt': major
---

One descriptor schema for every host, and a schema for the bundle manifest.

`bundles`, `runtimeConfig` and `publicRuntimeConfig` are core descriptor fields. Only the Nuxt adapter's copy of the schema described them, so every other host accepted them through `additionalProperties` without describing them, and that copy had already drifted: it allowed `runtimeConfig` only as an object, while both adapters also accept the bare mode string. The removed `providerPreferences` field is explicitly rejected instead of being accepted as unknown metadata and silently ignored.

- `descriptorSchema` declares all three fields. `bundles` is recursive and `runtimeConfig` accepts a mode or `{ validation }`.
- `bundleManifestSchema` states the manifest wrapper: `bundles` is required, a `$schema` pointer is allowed, and nothing else is. `loadBundleManifest` validates against it, so a run-wide key in a grouping file is reported instead of silently ignored.
  Descriptors that beta.6 accepted can now fail validation: the three fields were previously unconstrained through `additionalProperties`, and each now has a shape. A `runtimeConfig` carrying keys beside `validation`, a removed `providerPreferences` field, or a non-array `bundles` are rejected at discovery. The error names the offending key.

- `@lorion-org/nuxt` validates against the shared schema. `@lorion-org/nuxt/descriptor-schema` now exports `descriptorSchema`; the forked `nuxtExtensionDescriptorSchema` is gone, and a host that extended it spreads `descriptorSchema` instead. The `$defs` are renamed with it: a host reaching into `$defs.extension` reads `$defs.descriptor`, alongside `semver`, `dependencyMap` and `runtimeConfigValidationMode`. An extension that re-adds `bundles`, `runtimeConfig` or `publicRuntimeConfig` can drop those; they are core fields now, and re-declaring `runtimeConfig` as an object alone rejects the mode string the adapters accept.
