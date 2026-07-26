---
'@lorion-org/descriptor-discovery': major
'@lorion-org/descriptor-selection': patch
'@lorion-org/react': patch
'@lorion-org/nuxt': major
---

One typed descriptor, held to the schema at compile time.

A descriptor's shape was declared four times: the graph type, the shared JSON schema, the Nuxt adapter's own descriptor type and a private manifest type. They had already drifted, and the drift was invisible because `Descriptor` carries an index signature: every field the schema declared but no type did was reachable only as `unknown`, so each use site cast instead of failing.

- `SchemaDescriptor` in `@lorion-org/descriptor-discovery` is the descriptor as the shared schema describes it: the graph fields plus `bundles`, `providerPreferences`, `runtimeConfig` and `publicRuntimeConfig`, typed by the packages that own them. The casts at the selection, React and Nuxt use sites are gone.
- `DescriptorField` lists the declared fields and is checked against `descriptor.schema.json` at compile time, in both directions. A field added to the JSON no longer compiles until it is declared, and vice versa.
- `NuxtExtensionDescriptor` is `SchemaDescriptor`. It described the same four fields, with `runtimeConfig` narrower than the code accepts.
- `loadBundleManifest` states no manifest type of its own: `bundles.schema.json` is the definition, validated once, narrowed once.
