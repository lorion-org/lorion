---
'@lorion-org/react': major
---

Remove `CapabilitySelectionSeedOptions` from `@lorion-org/react/vite`.

It was a local alias of the seed-options shape and unreferenced even inside this package, while the loader typed `selectionSeed` through the core's copy — which was missing `key`. The seed contract now has one declaration, so the alias has nothing left to name. A consumer that imported it uses `Omit<DescriptorSelectionSeedInput, 'defaultValue'>` from `@lorion-org/composition-graph`, which is what it aliased.

`CapabilityManifest` in `@lorion-org/react` is now `SchemaDescriptor`. It described the same descriptor fields a fifth time, with `runtimeConfig` narrower than the code accepts and a `description` field no schema declares; a host attaching its own data still can, through the descriptor's index signature.
