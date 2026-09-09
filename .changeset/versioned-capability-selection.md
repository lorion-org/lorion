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
shared schema requires concrete descriptor versions and accepts npm SemVer
dependency ranges, including partial, wildcard, comparator, union and hyphen
ranges. Its `semver-range` format is registered by Lorion loaders; hosts using
the exported schema directly must register it in their validator.
Package names must remain distinct for candidates in the same workspace.

Custom dependency relation overrides retain their host-defined value semantics.
Inactive providers do not multiply version search work. Origin reports derive
grouping status and provider alternatives from the resolved source and catalog.

Use locale-independent candidate ordering. Resolve fixed dependency/provider
relations before choosing versions so impossible provider requirements do not
multiply independent active version choices. Include generated React module
execution tests in the regular package test command.
