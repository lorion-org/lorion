---
'@lorion-org/composition-graph': minor
'@lorion-org/descriptor-selection': major
'@lorion-org/descriptor-discovery': major
'@lorion-org/capability-composition': major
'@lorion-org/react': major
'@lorion-org/nuxt': major
---

Resolve one compatible version per capability id across workspace sources.

Different versions of an id can coexist in discovery. Selection considers newer
versions first and backtracks to satisfy active transitive dependency constraints,
preserving provider precedence and each candidate's package and directory.
Duplicate id/version identities and unsatisfiable requirements fail explicitly.
Composition reports, React virtual modules and Nuxt runtime selection expose the
resolved versions.

Dependency ranges that were previously ignored are now enforced, even with a
single available candidate. Correct mismatched manifests before upgrading. The
shared schema requires concrete descriptor versions and accepts exact, caret and
tilde dependency constraints, including SemVer prerelease and build metadata.
Package names must remain distinct for candidates in the same workspace.
