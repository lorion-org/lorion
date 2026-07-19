import { defineWebPlugin } from '@acme/plugin';
import { PAYMENT_PROVIDER_EXTENSION, type PaymentCheckoutProvider } from '../../payments/src';
import { InvoiceCheckoutPage } from './InvoiceCheckoutPage';

const provider: PaymentCheckoutProvider = {
  id: 'payment-provider-invoice',
  label: 'Invoice demo',
  createCheckoutPath: (input) =>
    `/providers/payment-provider-invoice/checkout?shop=${encodeURIComponent(input.shopId)}`,
};

export const paymentProviderInvoiceWebPlugin = defineWebPlugin({
  id: 'payment-provider-invoice',
  routes: [
    { path: '/providers/payment-provider-invoice/checkout', Component: InvoiceCheckoutPage },
  ],
  contributions: { [PAYMENT_PROVIDER_EXTENSION]: [provider] },
});
