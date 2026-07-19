import { defineWebPlugin } from '@acme/plugin';
import { PAYMENT_PROVIDER_EXTENSION, type PaymentCheckoutProvider } from '../../payments/src';
import { StripeCheckoutPage } from './StripeCheckoutPage';

const provider: PaymentCheckoutProvider = {
  id: 'payment-provider-stripe',
  label: 'Stripe demo',
  createCheckoutPath: (input) =>
    `/providers/payment-provider-stripe/checkout?shop=${encodeURIComponent(input.shopId)}`,
};

export const paymentProviderStripeWebPlugin = defineWebPlugin({
  id: 'payment-provider-stripe',
  routes: [{ path: '/providers/payment-provider-stripe/checkout', Component: StripeCheckoutPage }],
  contributions: { [PAYMENT_PROVIDER_EXTENSION]: [provider] },
});
