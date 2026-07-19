---
'@lorion-org/react': minor
---

`capabilityLoader` (and `discoverCapabilities`) accept a `surface: { name, activation }` option that consumes a `@lorion-org/surface-activation` `conventionActivation` resolver directly for a named surface. A build-time host no longer writes a per-host adapter (`({ capabilityDir, descriptor }) => resolver('web', { directory: capabilityDir, id: descriptor.id })`) to reuse the shared surface convention. The richer `activation` resolver — which also sees the descriptor and package.json — stays available for hosts that need it.
