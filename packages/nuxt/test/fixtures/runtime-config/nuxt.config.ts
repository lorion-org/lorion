import LorionNuxtModule from '../../../src/module';

export default defineNuxtConfig({
  modules: [LorionNuxtModule],
  lorion: {
    runtimeConfig: {
      fragments: {
        billing: {
          public: {
            apiBase: '/api/billing',
          },
          private: {
            token: 'billing-token',
          },
          contexts: {
            tenantA: {
              public: {
                apiBase: '/tenant-a/billing',
              },
            },
          },
        },
      },
      contextOutputKey: '__tenants',
      privateOutput: 'section',
    },
  },
});
