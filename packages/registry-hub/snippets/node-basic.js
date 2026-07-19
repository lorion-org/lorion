import { createRegistryHub } from '@lorion-org/registry-hub';
import process from 'node:process';

const hub = createRegistryHub();

hub.register('payment-checkout-providers', {
  id: 'payment-provider-stripe',
  createCheckoutPath: (input) =>
    `/providers/payment-provider-stripe/checkout?shop=${encodeURIComponent(input.shopId)}`,
});
hub.register('shops', { id: 'shop-coffee', path: '/shops/coffee' });

process.stdout.write(`${JSON.stringify(hub.list('payment-checkout-providers'))}\n`);
process.stdout.write(`${JSON.stringify(hub.get('shops', 'shop-coffee'))}\n`);
