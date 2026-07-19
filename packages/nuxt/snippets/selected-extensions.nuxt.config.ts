import { defineNuxtConfig } from 'nuxt/config';
import LorionNuxtModule, {
  createNuxtExtensionBootstrap,
  createNuxtExtensionLayerPaths,
} from '@lorion-org/nuxt';

const extensionBootstrap = createNuxtExtensionBootstrap({
  rootDir: __dirname,
  options: {
    defaultSelection: 'default',
    descriptorPaths: ['extensions/*/extension.json'],
  },
});

export default defineNuxtConfig({
  extends: createNuxtExtensionLayerPaths(extensionBootstrap),
  modules: [
    [
      LorionNuxtModule,
      {
        extensionBootstrap,
        providers: {
          configuredProviders: {
            'payment-checkout': 'payment-provider-stripe',
          },
        },
      },
    ],
  ],
});
