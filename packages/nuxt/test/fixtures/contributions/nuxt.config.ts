import {
  createNuxtExtensionBootstrap,
  createNuxtExtensionLayerPaths,
} from '../../../src/extensions';
import LorionNuxtModule from '../../../src/module';
const extensionBootstrap = createNuxtExtensionBootstrap({
  rootDir: __dirname,
  options: {
    descriptorPaths: ['extensions/*/extension.json'],
    selected: ['owner', 'guest'],
    selectionSeed: false,
  },
});
export default defineNuxtConfig({
  extends: createNuxtExtensionLayerPaths(extensionBootstrap),
  modules: [[LorionNuxtModule, { extensionBootstrap, contributions: true }]],
  nitro: { externals: { inline: ['vue', '@vue/server-renderer', 'unhead'] } },
});
