import { defineCapability } from '@lorion-org/react';
import { definePaymentCheckoutProviders } from '../../payments/src';
import manifest from '../capability.json';

export const capability = defineCapability({
  id: 'payment-provider-stripe',
  manifest,
  contributions: [
    definePaymentCheckoutProviders([
      {
        id: 'payment-provider-stripe',
        label: 'Stripe demo',
        createCheckoutPath: (input) =>
          `/providers/payment-provider-stripe/checkout?shop=${encodeURIComponent(input.shopId)}`,
      },
    ]),
  ],
});
