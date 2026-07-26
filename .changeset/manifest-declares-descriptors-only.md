---
'@lorion-org/descriptor-discovery': major
'@lorion-org/descriptor-selection': major
'@lorion-org/capability-composition': major
'@lorion-org/react': major
---

A bundle manifest declares descriptors and nothing else, and the always-on base is named by the host.

A manifest groups descriptors on a package and feature basis, so a run-wide seed does not belong in it: `base` and `default` named one base floor and one default selection for every host that reads the file, which a layered or multi-product setup cannot satisfy. The host already owns `baseDescriptors` and `defaultSelection`, and naming them there lets one manifest serve runs that seed it differently.

- `loadBundleManifest({ cwd, fileName? })` returns the declared `Descriptor[]`. The manifest format is `{ bundles: [ { id, version, dependencies } ] }`; `base` and `default` are gone, as is the `BundleManifest` type. A host that read them moves both into its seed.
- `bundles: { cwd, fileName? }` on `resolveSelectedCapabilities`, `composeCapabilities` and the React `capabilityLoader` adds the declared groupings to `virtualDescriptors` and no longer fills any seed.
- `baseSeed` and `resolveBaseSelection` are removed from `@lorion-org/descriptor-selection` and from the seeds `capability-composition` and `react` forward. The always-on base is what a host composes around, so swapping it per run described a different composition rather than a variant of one; `baseDescriptors` stands on its own.

A host that exposed the base as a CLI or environment override owns the parse now:

```ts
import { resolveDescriptorSelectionSeed } from '@lorion-org/composition-graph';

const named = resolveDescriptorSelectionSeed({ argv: process.argv, env: process.env, key: 'base' });
const seed = { baseDescriptors: named.length ? named : ['platform'], selected: [...] };
```
