import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadBundleManifest,
  resolveSelectedCapabilities,
} from '@lorion-org/capability-composition';

const workspaceRoot = dirname(fileURLToPath(import.meta.url));

// Batteries-included: discover a `bundles.json` upward from `cwd`, expand it into
// virtual grouping descriptors, and fill the base/default seed. A host declares its
// bundles in data (`{ base, default, bundles: [ { id, dependencies } ] }`) and needs
// no bundling code of its own — explicit `virtualDescriptors`/seed values still win.
const fromManifest = resolveSelectedCapabilities({
  workspaceRoot,
  bundles: { cwd: workspaceRoot },
  seed: {},
});

console.log(fromManifest.map((capability) => capability.id));

// Or feed grouping descriptors directly, with no manifest on disk: `storefront`
// groups real capabilities through its `dependencies` and takes part in selection,
// but carries no surface — so it is never imported and needs no `package.json`
// (its `packageName` resolves to '').
const fromVirtual = resolveSelectedCapabilities({
  workspaceRoot,
  virtualDescriptors: [
    { id: 'storefront', version: '0.0.0', dependencies: { web: '^1.0.0', checkout: '^1.0.0' } },
  ],
  seed: { selected: ['storefront'] },
});

console.log(fromVirtual.map((capability) => `${capability.id}:${capability.packageName}`));

// The manifest can also be loaded on its own, when a host drives selection itself and
// just wants the resolved descriptors and the base/default seed.
const manifest = loadBundleManifest({ cwd: workspaceRoot });

console.log(manifest.baseDescriptors, manifest.defaultSelection);
