---
'@lorion-org/capability-composition': minor
'@lorion-org/react': minor
---

Expand nested descriptors in the capability path. `resolveSelectedCapabilities`, `resolveCapabilitySelection` and the React `capabilityLoader` accept `nestedField`, the field in a discovered `capability.json` that holds further descriptors. A capability that groups others declares them next to itself instead of in a separate bundle manifest, which is what the Nuxt adapter already does through `discoverDescriptors`.
