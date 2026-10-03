import LorionNuxtModule, {
  createNuxtExtensionBootstrap,
  createNuxtExtensionLayerPaths,
} from '@lorion-org/nuxt';
import {
  describeCompositionOrigins,
  formatCompositionOrigins,
  loadBundleManifest,
  projectContributionPlan,
} from '@lorion-org/capability-composition';
import { contributionRelationDescriptor } from '@lorion-org/composition-graph';
import { resolvePackageSources } from '@lorion-org/descriptor-discovery';
import versionPolicy from './version-policy.json';

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
  patterns: ['layer-extensions/*', 'prototypes/*'],
  additionalRoots: [{ root: 'external', patterns: ['layer-extensions/*'] }],
  descriptorFileName: 'extension.json',
});

const groupings = loadBundleManifest({ cwd: __dirname });

const extensionBootstrap = createNuxtExtensionBootstrap({
  rootDir: __dirname,
  options: {
    versionSelectors: {
      beta: ({ prerelease }) => prerelease[0] === 'beta',
      next: ({ prerelease }) => prerelease[0] === 'beta',
      curated: ({ id, version }) =>
        versionPolicy.curated.some(
          (candidate) => candidate.id === id && candidate.version === version,
        ),
    },
    virtualDescriptors: groupings,
    baseDescriptors: [optionalProviderSlot],
    defaultSelection: [defaultBundle, 'shop-coffee'],
    // Discovery follows the snapshot instead of a pattern of its own, so the second
    // root takes part like any other and nothing is discovered twice.
    descriptorPaths: [
      ...snapshot.descriptorPaths,
      ...(process.env.LORION_EXAMPLE_PROFILE?.startsWith('failure-')
        ? ['tests/failures/*/extension.json']
        : []),
    ],
    // The declared contribution relation: an extension offers named points and others
    // declare which of them they fill. Registered so the graph carries the edge; it is
    // walked for inspection and changes nothing about what resolves.
    relationDescriptors: [contributionRelationDescriptor()],
  },
});

const descriptors = extensionBootstrap.resolvedExtensions.map((entry) => entry.descriptor);

const contributions = projectContributionPlan({
  catalog: extensionBootstrap.discoveredExtensions.map((entry) => entry.descriptor),
  selected: descriptors,
});

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
    ...contributions.edges.map(
      (edge) =>
        `    ${edge.source.id} -> ${edge.target.owner} (${edge.target.point}, ${edge.active ? 'active' : 'owner-not-selected'})`,
    ),
    '',
  ].join('\n'),
);

export default defineNuxtConfig({
  ...(process.env.LORION_EXAMPLE_PROFILE?.startsWith('failure-')
    ? {
        plugins: [`${__dirname}/tests/failures/observe.ts`],
        nitro: {
          handlers: [
            { route: '/__contribution-health', handler: `${__dirname}/tests/failures/health.ts` },
          ],
        },
      }
    : {}),
  extends: createNuxtExtensionLayerPaths(extensionBootstrap),
  runtimeConfig: { contributionPrivateProbe: 'LORION_PRIVATE_CONFIG_PROBE' },
  vite: {
    plugins: [
      {
        name: 'contribution-acceptance-boundaries',
        generateBundle(_options, bundle) {
          if (!process.env.LORION_EXAMPLE_PROFILE) return;
          const profile = process.env.LORION_EXAMPLE_PROFILE;
          const chunks = Object.values(bundle).filter((entry) => entry.type === 'chunk');
          const modules = chunks
            .flatMap((chunk) => Object.keys(chunk.modules))
            .map((id) => id.replaceAll('\\', '/'));
          const code = chunks.map((chunk) => chunk.code).join('\n');
          if (code.includes('LORION_PRIVATE_CONFIG_PROBE'))
            throw new Error('Private configuration entered an application bundle.');
          const coffeeImplementations = [
            '/layer-extensions/shop-coffee/',
            '/prototypes/shop-coffee/',
            '/layer-extensions/shop-coffee-beta-v2/',
            '/layer-extensions/shop-coffee-beta-v3/',
          ];
          const selectedCoffee =
            profile.startsWith('legacy') || profile === 'curated-compatible'
              ? '/prototypes/shop-coffee/'
              : profile === 'beta-compatible' || profile === 'curated'
                ? '/layer-extensions/shop-coffee-beta-v2/'
                : profile.startsWith('beta')
                  ? '/layer-extensions/shop-coffee-beta-v3/'
                  : '/layer-extensions/shop-coffee/';
          const forbidden =
            profile === 'inactive'
              ? [
                  '/layer-extensions/checkout/',
                  '/layer-extensions/payments/',
                  '/layer-extensions/shops/',
                  ...coffeeImplementations,
                ]
              : coffeeImplementations.filter((path) => path !== selectedCoffee);
          for (const fragment of forbidden)
            if (modules.some((id) => id.includes(fragment)))
              throw new Error(
                `Unselected implementation entered an application bundle: ${fragment}`,
              );
        },
      },
    ],
  },
  modules: [
    [
      LorionNuxtModule,
      {
        extensionBootstrap,
        logging: true,
        contributions: true,
      },
    ],
  ],
});
