---
'@lorion-org/descriptor-selection': minor
'@lorion-org/capability-composition': minor
'@lorion-org/react': minor
'@lorion-org/nuxt': minor
---

Support caller-defined named version selectors in programmatic, CLI and environment
seeds. Register synchronous candidate predicates with `versionSelectors` and request
`id@name`; selection intersects their exact eligible sets with active SemVer
requirements using the existing ordering and backtracking. Reports preserve named
requests, selector names and eligible versions. Composition and both framework
adapters forward the shared contract; ordinary ranges, stable defaults, provider
precedence and descriptor dependency grammar remain unchanged.
