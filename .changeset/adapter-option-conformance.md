---
'@lorion-org/capability-composition': major
'@lorion-org/react': major
'@lorion-org/nuxt': major
---

One composition option contract, accepted by every adapter.

Each host adapter maintained its own option list beside the core's, with nothing linking them, so an option lived wherever its first consumer needed it: the React loader had bundle manifests, virtual descriptors and a selection policy that Nuxt could not reach, while Nuxt had descriptor path globs and a configurable descriptor schema that React could not reach. `composeCapabilities` restated the list a third time and had already fallen behind `resolveCapabilitySelection` by two options, so a runtime composition silently resolved a different set than the build-time one for the same input.

- `CapabilitySelectionInput` is the one contract. It gains `descriptorPaths`, `descriptorSchema` and `relationDescriptors`, all of which the discovery and selection packages already supported but no host could reach through the core.
- `composeCapabilities` takes `CapabilityCompositionInput` (the selection input plus the surface, loader and register hooks) and forwards it whole, so a runtime composition resolves exactly what the build-time one does.
- `CapabilityLoaderOptions` (React) and `NuxtExtensionModuleOptions` (Nuxt) derive their shared half from `CapabilitySelectionInput`. React gains `descriptorPaths` and `descriptorSchema`; Nuxt gains `bundles`, `virtualDescriptors`, `capabilitiesDir`, `policy` and a configurable `nestedField`. A conformance test in each adapter states the requirement, so an option the core gains cannot be dropped silently.
- Nuxt addresses a nested descriptor at a synthetic directory, as the React path already does. A grouping declared inside another extension's descriptor no longer inherits its host's directory, so it can no longer register that host's app, config or server dirs as a layer.
