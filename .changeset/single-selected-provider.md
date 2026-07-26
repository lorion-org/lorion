---
'@lorion-org/descriptor-selection': major
---

Reject a selection that names more than one provider of the same capability. Both were previously seeded and therefore both resolved, so a host silently composed a capability served twice. `assertSingleSelectedProvider` reports the capability and the competing providers, mirroring `assertSingleDefaultProvider` for descriptor-level defaults, and `selectDescriptors` applies it before provider preferences are resolved.
