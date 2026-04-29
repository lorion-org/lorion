import { createRegistryHub } from '@lorion-org/registry-hub';

export default defineNuxtPlugin(() => {
  const registryHub = createRegistryHub();

  console.log(['registryHub']);
  // ['registryHub']

  return {
    provide: {
      registryHub,
    },
  };
});
