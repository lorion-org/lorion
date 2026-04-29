export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hooks.hook('payment-checkout:created', ({ registerProvider }) => {
    registerProvider({
      id: 'payment-provider-invoice',
      label: 'Invoice demo',
      createCheckoutPath: (input) =>
        `/providers/payment-provider-invoice/checkout?shop=${encodeURIComponent(input.shopId)}`,
    });
  });
});
