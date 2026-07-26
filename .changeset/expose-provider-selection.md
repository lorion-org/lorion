---
'@lorion-org/descriptor-selection': major
'@lorion-org/capability-composition': major
---

Publish the provider outcome of a composition. `resolveCapabilitySelection` returns the resolved capabilities together with the `ProviderSelectionResolution`: which provider won each contested capability, in which mode, the candidates and the providers that lost. `selectDescriptorsWithProviders` and `describeProviderSelection` expose the same for descriptor selection.

The Nuxt adapter already published this; a React host had to re-derive the winner from the resolved set, which loses `mode` and `excludedProviderIds` and costs a second resolution. `resolveSelectedCapabilities` and `selectDescriptors` keep returning the plain set.

The outcome describes the composed set, not the discovered one: a host that names an artifact after the winning provider must not be handed a provider this composition never activates. `selectDescriptorsWithProviders` also returns the `catalog` it resolved against, so a host that inspects the graph reads it there instead of building a second one from the same descriptors.
