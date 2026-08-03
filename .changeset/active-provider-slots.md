---
'@lorion-org/capability-composition': major
'@lorion-org/descriptor-selection': major
'@lorion-org/nuxt': major
'@lorion-org/provider-selection': major
'@lorion-org/react': major
---

Model provider choices as active slots whose participation, requirement, and
selection are independent.

- A capability with provider candidates may remain active and visibly `unfilled`
  when no resolved descriptor depends on it.
- Dependencies of resolved descriptors make the capability required; explicit
  and concrete dependency requests still select and require a provider, while a
  default may fill an active non-required slot.
- Replace the winner-only `selections` map with a serializable, capability-sorted
  `slots` array. Each slot is a `selected` or `unfilled` discriminated state and
  carries its requirement and candidates.
- Publish the same provider-slot result through composition reports, Nuxt public
  runtime config, and React's `virtual:capabilities` module.
