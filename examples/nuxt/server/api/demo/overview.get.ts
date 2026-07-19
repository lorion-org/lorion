import {
  getNuxtExtensionSelection,
  getNuxtProviderSelection,
} from '@lorion-org/nuxt/runtime-config';

export default defineEventHandler(() => {
  const runtimeConfig = useRuntimeConfig();

  return {
    extensionSelection: getNuxtExtensionSelection(runtimeConfig),
    providerSelection: getNuxtProviderSelection(runtimeConfig),
  };
});
