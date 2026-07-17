---
'@lorion-org/capability-composition': minor
---

Add `@lorion-org/capability-composition`, a framework-free package for composing descriptor-defined capabilities over the LORION core. It exposes `resolveSelectedCapabilities` (discovery, dependency-graph selection, provider selection, and seeding), `conventionActivation` (configurable file-marker and export-name detection), and `composeCapabilities` (a registry-agnostic discover, select, activate, and register loop). Hosts reuse one composition path and supply only their activation convention and registration.
