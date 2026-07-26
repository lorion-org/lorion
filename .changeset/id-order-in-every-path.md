---
'@lorion-org/descriptor-selection': patch
---

Return items ordered by id on every path, including the one that resolves nothing.

`selectDescriptorsWithProviders` documents a stable id order, but the short circuit for "neither a selection nor a base floor" returned discovery order. A host with no seed and no base therefore mounted in filesystem order while every other host mounted by id, and the order changed when a directory was renamed. The order is a contract of the function, not of the path an input happens to take.
