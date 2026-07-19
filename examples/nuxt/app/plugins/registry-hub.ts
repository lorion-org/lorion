import { createRegistryHub } from '@lorion-org/registry-hub';

export default defineNuxtPlugin({
  name: 'registry-hub',
  enforce: 'pre',
  setup: () => ({
    provide: {
      registryHub: createRegistryHub(),
    },
  }),
});
