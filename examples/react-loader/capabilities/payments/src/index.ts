import { useContributions } from '@acme/plugin';

export type CheckoutInput = {
  shopId: string;
};

export type PaymentCheckoutProvider = {
  id: string;
  label: string;
  createCheckoutPath: (input: CheckoutInput) => string;
};

// The host's payment-provider extension point. Provider capabilities contribute
// here; the shop pages read the selected provider back. Model B resolves provider
// selection at build time, so at most one provider is present.
export const PAYMENT_PROVIDER_EXTENSION = 'acme.payment-checkout-providers';

export function usePaymentProvider(): PaymentCheckoutProvider | undefined {
  return useContributions<PaymentCheckoutProvider>(PAYMENT_PROVIDER_EXTENSION)[0];
}
