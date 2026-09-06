import LorionNuxtModule, {
  createNuxtExtensionBootstrap,
  createNuxtExtensionLayerPaths,
} from '@lorion-org/nuxt';
import {
  describeCompositionOrigins,
  formatCompositionOrigins,
  loadBundleManifest,
} from '@lorion-org/capability-composition';
import {
  assertKnownReferences,
  contributionRelationDescriptor,
  defaultRelationDescriptors,
  resolveContributions,
} from '@lorion-org/composition-graph';
import { resolvePackageSources } from '@lorion-org/descriptor-discovery';

// The same grouping model the React examples use: a bundles.json declares the
// groupings, this host names which of them runs by default. No extension package
// exists just to carry a grouping.
const defaultBundle = 'default';
const optionalProviderSlot = 'product-theme';

// The package set this host composes: the layer extensions of this project, plus
// those of a second root joined into the same set. An extension is a package on disk
// whose descriptor lies beside its manifest, and this host spells that descriptor
// `extension.json`.
const snapshot = resolvePackageSources({
  root: __dirname,
  patterns: ['layer-extensions/*'],
  additionalRoots: [{ root: 'external', patterns: ['layer-extensions/*'] }],
  descriptorFileName: 'extension.json',
});

const groupings = loadBundleManifest({ cwd: __dirname });

const extensionBootstrap = createNuxtExtensionBootstrap({
  rootDir: __dirname,
  options: {
    virtualDescriptors: groupings,
    baseDescriptors: [optionalProviderSlot],
    defaultSelection: [defaultBundle],
    // Discovery follows the snapshot instead of a pattern of its own, so the second
    // root takes part like any other and nothing is discovered twice.
    descriptorPaths: [...snapshot.descriptorPaths],
    // The declared contribution relation: an extension offers named points and others
    // declare which of them they fill. Registered so the graph carries the edge; it is
    // walked for inspection and changes nothing about what resolves.
    relationDescriptors: [contributionRelationDescriptor()],
  },
});

const descriptors = extensionBootstrap.discoveredExtensions.map((entry) => entry.descriptor);

// A name no descriptor declares resolves to nothing at all, in either relation.
assertKnownReferences({
  descriptors,
  relationDescriptors: [...defaultRelationDescriptors, contributionRelationDescriptor()],
});

const contributions = resolveContributions(descriptors);

// Why each extension is in this composition. The bootstrap already resolved it; these
// rows are a projection of that one resolution and re-resolve nothing.
const origins = describeCompositionOrigins({
  selected: extensionBootstrap.selectedExtensions,
  base: extensionBootstrap.baseExtensionIds,
  resolved: extensionBootstrap.resolvedExtensionIds,
  descriptors,
  groupings: groupings.map((grouping) => grouping.id),
  providerSlots: extensionBootstrap.providerSelection.slots,
});

console.log(
  [
    '',
    'Composed extensions:',
    ...formatCompositionOrigins(origins),
    '',
    '  Contributions:',
    ...contributions.edges.map((edge) => `    ${edge.from} -> ${edge.to} (${edge.point})`),
    '',
  ].join('\n'),
);

export default defineNuxtConfig({
  extends: createNuxtExtensionLayerPaths(extensionBootstrap),
  modules: [
    [
      LorionNuxtModule,
      {
        extensionBootstrap,
        logging: true,
      },
    ],
  ],
});
