---
'@lorion-org/capability-composition': major
'@lorion-org/descriptor-selection': major
'@lorion-org/nuxt': major
---

One selection seed, one selection brain.

The seed shape was declared in five places and had already diverged: the copy in `@lorion-org/capability-composition` was missing `key`, and the Nuxt adapter accepted a comma-separated string where the core takes a list. The Nuxt adapter also rebuilt the selection pipeline instead of calling it, so two guards applied on one host and not the other for the very same descriptors.

- `CapabilitySelectionSeed` is `DescriptorSelectionSeed`, owned by the package that resolves it. `selectionSeed.key` is now typeable everywhere it works.
- `NuxtExtensionModuleOptions` takes the core spelling: `baseDescriptors` replaces `baseExtensions`, and `selected`, `defaultSelection` and `baseDescriptors` take lists. The callback form of `baseExtensions` is gone, so a host that derived its base from the discovered set computes the list before passing it in:

  ```ts
  // before: the module called this after discovery and selection
  baseExtensions: ({ descriptors, selectedExtensions }) => pickBase(descriptors, selectedExtensions),

  // after: discover and resolve the selection first, then pass a list
  import { discoverDescriptors } from '@lorion-org/descriptor-discovery';
  import { resolveDescriptorSelection } from '@lorion-org/descriptor-selection';

  const discovered = discoverDescriptors({ cwd, descriptorPaths });
  const selected = resolveDescriptorSelection({ defaultSelection, selectionSeed });
  const baseDescriptors = pickBase(discovered.map((entry) => entry.descriptor), selected);
  ```

  A host that only needs the discovered set can call `discoverDescriptors` alone; `resolveDescriptorSelection` is needed only when the base depends on what was selected.

- The Nuxt adapter resolves through `selectDescriptorsWithProviders`. A `disabled` descriptor is no longer resolvable there, and a selection naming two providers of one capability now fails, both as they already did on every other host.
- Resolved items are returned ordered by id rather than in discovery order, so two hosts reading the same workspace agree on the order they mount, register or layer in. It is not dependency order: a host that needs its dependencies first sorts for that itself.
- The Nuxt bootstrap's `selectedExtensions` and `baseExtensionIds` keep the deduplication and ordering they had, which the published `publicRuntimeConfig.extensionSelection` carries.
