import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  loadBundleManifest,
  resolveSelectedCapabilities,
} from '@lorion-org/capability-composition';

const workspaceRoot = dirname(fileURLToPath(import.meta.url));

// The manifest declares descriptors only. Which grouping is the always-on base and
// which is the default selection belongs to this run, so this host injects it.
const seed = {
  baseDescriptors: ['commerce'],
  defaultSelection: ['storefront'],
};

// Batteries-included: discover a `bundles.json` upward from `cwd` and expand it
// into virtual grouping descriptors. A host declares its bundles in data
// (`{ bundles: [ { id, dependencies } ] }`) and needs no bundling code of its own.
const fromManifest = resolveSelectedCapabilities({
  workspaceRoot,
  bundles: { cwd: workspaceRoot },
  seed,
});

console.log(fromManifest.map((capability) => capability.id));

// Or feed grouping descriptors directly, with no manifest on disk: `storefront`
// groups real capabilities through its `dependencies` and takes part in selection,
// but carries no surface — so it is never imported and needs no `package.json`
// (its `packageName` resolves to '').
const storefront = {
  id: 'storefront',
  version: '0.0.0',
  dependencies: { web: '^1.0.0', checkout: '^1.0.0' },
};

const fromVirtual = resolveSelectedCapabilities({
  workspaceRoot,
  virtualDescriptors: [storefront],
  seed: { selected: [storefront.id] },
});

console.log(fromVirtual.map((capability) => `${capability.id}:${capability.packageName}`));

// The manifest can also be loaded on its own, when a host drives selection itself
// and just wants the declared grouping descriptors.
console.log(loadBundleManifest({ cwd: workspaceRoot }).map((descriptor) => descriptor.id));
