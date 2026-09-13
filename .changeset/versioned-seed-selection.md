---
'@lorion-org/descriptor-selection': major
'@lorion-org/capability-composition': major
'@lorion-org/react': major
'@lorion-org/nuxt': major
'@lorion-org/composition-graph': minor
---

Accept `id@<SemVer range>` in explicit, default, base and CLI/env seeds. Seed
constraints intersect with active dependency requirements; incompatible requests
fail with their sources and available versions. Unqualified roots now require a
stable version, replacing the previous behavior that could select a prerelease.
Select prereleases with an explicit matching version range.

Capture the seed with the composition result and forward selected source and
requirement provenance to reports. React and Nuxt retain version constraints
through loading and layer selection. Preserve ordinary provider dependencies
outside grouping membership and consider membership in version backtracking.
Treat an empty contribution dependency range as the npm wildcard.
