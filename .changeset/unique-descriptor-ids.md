---
'@lorion-org/composition-graph': major
---

Reject two descriptors sharing one id.

A composition addresses every descriptor by its id, and `buildDescriptorMap` kept the last one it saw. The first descriptor's dependencies, provider role and surface then vanished with no error: a grouping declared in a bundle manifest under the id of a discovered capability silently replaced that capability, and in the Nuxt adapter the real extension stopped registering its layer. The duplicate ids are now reported.
