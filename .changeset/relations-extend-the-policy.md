---
'@lorion-org/composition-graph': minor
'@lorion-org/descriptor-selection': minor
'@lorion-org/descriptor-discovery': minor
---

Let a host register a relation without replacing the ones a composition already
walks, and read the declared contribution relation.

- `RelationDescriptor` carries optional `roles` (`resolution`, `provenance`,
  `inspection`), and `extendCompositionPolicy(policy, relationDescriptors)` appends
  each registered relation to the lists its roles name. A relation without roles is
  registered and walked by nothing, which is what happened before.
- `providerRelationDescriptors` declares those roles, and
  `selectDescriptorsWithProviders` extends the policy with the relations it carries.
  A policy that named `resolutionRelationIds` to add an edge of its own used to drop
  the provider relation with it, and every default provider lost its slot.
- `resolveContributions(descriptors, options?)`, `contributionRelationDescriptor()`
  and the descriptor fields `contributionPoints` / `contributesTo`: a descriptor
  offers named points, others declare which of them they fill. A contribution to an
  unknown descriptor, to a point its owner does not declare, or to the contributor
  itself aborts while the declaring descriptor can still be named. Resolution does
  not walk the relation.
- `assertKnownReferences({ descriptors, relationDescriptors? })` reports a name no
  descriptor declares together with the descriptor that declared it and the relation
  it declared it under. A relation resolves only for a target the descriptor map
  holds, so such a name otherwise shrinks the composition in silence.
