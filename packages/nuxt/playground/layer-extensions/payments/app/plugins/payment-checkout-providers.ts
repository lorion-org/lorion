import type { PaymentCheckoutProvider } from '../../types';

const paymentProviderRegistryName = 'payment-checkout-providers';

export default defineNuxtPlugin({
  name: 'payment-checkout-providers',
  enforce: 'pre',
  setup: (nuxtApp) => {
    const getProvider = (providerId?: string): PaymentCheckoutProvider | undefined => {
      const paymentConfig = usePublicRuntimeConfigScope<{ configuredProvider?: string }>(
        'payments',
      );
      const id = providerId ?? paymentConfig.configuredProvider;

      return id
        ? nuxtApp.$registryHub.get<PaymentCheckoutProvider>(paymentProviderRegistryName, id)
        : undefined;
    };

    nuxtApp.hooks.hook('app:created', () => {
      void nuxtApp.hooks.callHook('payment-checkout:created', {
        registerProvider: (provider) =>
          nuxtApp.$registryHub.register(paymentProviderRegistryName, provider),
      });
    });

    return {
      provide: {
        payment: {
          getProvider,
        },
      },
    };
  },
});
