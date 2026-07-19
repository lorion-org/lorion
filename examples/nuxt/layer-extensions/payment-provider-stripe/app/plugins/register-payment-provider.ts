export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hooks.hook('payment-checkout:created', ({ registerProvider }) => {
    registerProvider({
      id: 'payment-provider-stripe',
      label: 'Stripe demo',
      createCheckoutPath: (input) =>
        `/providers/payment-provider-stripe/checkout?shop=${encodeURIComponent(input.shopId)}`,
    });
  });
});
