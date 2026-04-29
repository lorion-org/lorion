import {
  createNuxtExtensionBootstrap,
  createNuxtExtensionLayerPaths,
} from '../../../src/extensions';
import LorionNuxtModule from '../../../src/module';

const extensionBootstrap = createNuxtExtensionBootstrap({
  rootDir: __dirname,
});

export default defineNuxtConfig({
  extends: createNuxtExtensionLayerPaths(extensionBootstrap),
  modules: [[LorionNuxtModule, { extensionBootstrap }]],
  nitro: {
    externals: {
      inline: ['vue', '@vue/server-renderer', 'unhead'],
    },
  },
});
