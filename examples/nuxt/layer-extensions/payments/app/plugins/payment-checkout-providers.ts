import { getNuxtProviderSelection } from '@lorion-org/nuxt/runtime-config';
import { point } from '../../contributions';
export default defineNuxtPlugin({
  name: 'payment-checkout-providers',
  dependsOn: ['lorion-contributions'],
  setup() {
    const nuxtApp = useNuxtApp();
    const selection = getNuxtProviderSelection(useRuntimeConfig());
    const slot = selection?.slots.find((entry) => entry.capabilityId === 'checkout');
    const id = slot?.state === 'selected' ? slot.selectedProviderId : undefined;
    return {
      provide: {
        payment: {
          getProvider: () =>
            nuxtApp.$contributions.get(point).find(({ value }) => value.id === id)?.value,
        },
      },
    };
  },
});
