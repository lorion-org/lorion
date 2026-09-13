---
'@lorion-org/descriptor-selection': patch
---

Activate callback-only members of indirectly reached selection groups. Provider
members retain dependency precedence; explicitly selected groups retain explicit
precedence. Membership does not introduce dependency version ranges. Including a
capability only as a member leaves its provider slot optional; including a provider
requests that provider. Inactive or overridden providers contribute no members.
