import LorionNuxtModule, {
  createNuxtExtensionBootstrap,
  createNuxtExtensionLayerPaths,
} from '@lorion-org/nuxt';

// The same grouping model the React examples use: a bundles.json declares the
// groupings, this host names which of them runs by default. No extension package
// exists just to carry a grouping.
const defaultBundle = 'default';

const extensionBootstrap = createNuxtExtensionBootstrap({
  rootDir: __dirname,
  options: {
    bundles: { cwd: __dirname },
    defaultSelection: [defaultBundle],
    descriptorPaths: ['layer-extensions/*/extension.json'],
  },
});

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
