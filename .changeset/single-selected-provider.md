---
'@lorion-org/descriptor-selection': major
---

Reject explicit provider roots that name more than one provider of the same capability. Both would otherwise resolve, so a host could silently compose a capability served twice. `assertSingleSelectedProvider` reports the capability and the competing providers, mirroring `assertSingleDefaultProvider` for descriptor-level defaults, and `selectDescriptors` applies it before provider selection is resolved.
