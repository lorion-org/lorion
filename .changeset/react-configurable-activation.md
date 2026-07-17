---
'@lorion-org/react': minor
---

Add a configurable `activation` resolver to `capabilityLoader`, `discoverCapabilities`, and `discoverSelectedCapabilities`. Hosts can now point a capability's activation at any existing package export by returning a custom `exportSubpath` and `exportName`, instead of the fixed `./capability` subpath and `capability` named export. Returning a nullish activation marks a capability as graph-only: it takes part in dependency resolution (and appears in `resolvedCapabilityIds`) but activates nothing and emits no import. The default behavior is unchanged; a custom activation leaves specifier resolution to the host bundler. `DiscoveredCapability.exportName` and `importSpecifier` are optional for graph-only capabilities, and `entryFile` is optional for host-resolved activations. Also fix the `VitePlugin` type so a `capabilityLoader()` plugin is assignable to Vite's `PluginOption` under `exactOptionalPropertyTypes`.
