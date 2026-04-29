export type PaymentCheckoutProvider = {
  createCheckoutPath: (input: { shopId: string }) => string;
  id: string;
  label: string;
};

declare module '#app' {
  interface RuntimeNuxtHooks {
    'payment-checkout:created': (context: {
      registerProvider: (provider: PaymentCheckoutProvider) => void;
    }) => void;
  }
}
