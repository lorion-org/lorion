import { createRegistryHub, type RegistryItem } from '@lorion-org/registry-hub';

type PaymentProvider = RegistryItem & {
  createCheckoutPath: (input: { shopId: string }) => string;
};

type Shop = RegistryItem & {
  path: string;
};

const hub = createRegistryHub();

hub.register<PaymentProvider>('payment-checkout-providers', {
  id: 'payment-provider-stripe',
  createCheckoutPath: (input) =>
    `/providers/payment-provider-stripe/checkout?shop=${encodeURIComponent(input.shopId)}`,
});
hub.register<Shop>('shops', { id: 'shop-coffee', path: '/shops/coffee' });

console.log(hub.list<PaymentProvider>('payment-checkout-providers'));
// [{ id: 'payment-provider-stripe', createCheckoutPath: [Function] }]

console.log(hub.get<Shop>('shops', 'shop-coffee'));
// { id: 'shop-coffee', path: '/shops/coffee' }
