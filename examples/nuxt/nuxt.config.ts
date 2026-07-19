import LorionNuxtModule, {
  createNuxtExtensionBootstrap,
  createNuxtExtensionLayerPaths,
} from '@lorion-org/nuxt';

const extensionBootstrap = createNuxtExtensionBootstrap({
  rootDir: __dirname,
  options: {
    defaultSelection: 'default',
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
