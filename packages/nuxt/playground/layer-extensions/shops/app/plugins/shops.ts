import type { Shop } from '../../types';

const shopRegistryName = 'shops';

export default defineNuxtPlugin({
  name: 'shops',
  enforce: 'pre',
  setup: (nuxtApp) => {
    nuxtApp.hooks.hook('app:created', () => {
      void nuxtApp.hooks.callHook('shops:created', {
        registerShop: (shop) => nuxtApp.$registryHub.register(shopRegistryName, shop),
      });
    });

    return {
      provide: {
        shops: {
          list: () => nuxtApp.$registryHub.list<Shop>(shopRegistryName),
        },
      },
    };
  },
});
