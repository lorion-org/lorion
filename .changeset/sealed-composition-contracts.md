---
'@lorion-org/capability-composition': minor
'@lorion-org/composition-graph': minor
'@lorion-org/descriptor-discovery': minor
'@lorion-org/descriptor-selection': minor
'@lorion-org/nuxt': minor
'@lorion-org/react': minor
---

Add a workspace composition run that seals package and descriptor filesystem
observation, plus a versioned candidate inventory and source consistency checks.
The returned JavaScript values remain mutable. Directly selected groupings now give
their provider members explicit precedence after grouping-version selection. Add
version-aware contribution catalog validation and active projection, and let the
React Vite loader consume an existing composition run without rediscovery.
Descriptor discovery retains the exact descriptor documents in package snapshots,
so the workspace run validates and expands them without another filesystem read.
