import { defineCapability } from '@lorion-org/react';
import { definePaymentCheckoutProviders } from '../../payments/src';
import manifest from '../capability.json';

export const capability = defineCapability({
  id: 'payment-provider-invoice',
  manifest,
  contributions: [
    definePaymentCheckoutProviders([
      {
        id: 'payment-provider-invoice',
        label: 'Invoice demo',
        createCheckoutPath: (input) =>
          `/providers/payment-provider-invoice/checkout?shop=${encodeURIComponent(input.shopId)}`,
      },
    ]),
  ],
});
