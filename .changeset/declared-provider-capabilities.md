---
'@lorion-org/descriptor-selection': major
'@lorion-org/descriptor-discovery': minor
---

A capability a descriptor provides for must be declared, and a descriptor may describe itself.

A mistyped `providesFor` used to open a second capability that nothing requires. The real one then fell back to its default, the mistyped one resolved its provider, and the composition became a different product with no error: one wrong character turned a selected distribution into two. `assertKnownProviderCapabilities` now reports it, naming both the capability and the descriptors that point at it.

The check runs against every discovered descriptor, not the resolved subset, so a provider whose capability exists elsewhere in the workspace but takes no part in this composition is unaffected. It fails only when nothing in the workspace declares the capability at all.

A capability is declared like any other descriptor, and needs no package:

```json
{ "id": "payment", "version": "0.0.0", "description": "Capability filled by a payment provider." }
```

`description` is now a declared optional field on the descriptor schema. It was already accepted through `additionalProperties`, so it validated nowhere and no editor offered it. A capability slot needs it most: it is an id others provide for and carries nothing else that says what it is.
