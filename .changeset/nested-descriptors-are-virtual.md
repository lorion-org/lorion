---
'@lorion-org/descriptor-discovery': major
'@lorion-org/capability-composition': major
'@lorion-org/react': major
'@lorion-org/nuxt': major
---

Mark a nested descriptor as such. `DiscoveredDescriptor` gains `nested`, true for a descriptor declared inside another descriptor's nested field. It shares the host's directory but owns no package there, so `resolveSelectedCapabilities` now addresses it like any other grouping: a synthetic directory, an empty package name and no surface. Without this a grouping declared next to its host counted as a package and could resolve the host's surface marker as its own.

`nested` is a required property of `DiscoveredDescriptor`, so a host that builds one by hand declares it. Every host now applies the same treatment: the React loader gives a nested grouping a synthetic directory, an empty package name and no activation, and the Nuxt adapter keeps one out of layer registration whatever its host's directory contains. Both previously read the host's package and surface, which emitted an import of an export that does not exist.
