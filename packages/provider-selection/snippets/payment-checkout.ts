import { resolveItemProviderSelection } from '@lorion-org/provider-selection';

type PaymentProviderDescriptor = {
  id: string;
  providesFor?: string | string[];
};

const descriptors: PaymentProviderDescriptor[] = [
  {
    id: 'payment-provider-stripe',
    providesFor: 'checkout',
  },
  {
    id: 'payment-provider-invoice',
    providesFor: 'checkout',
  },
];

const result = resolveItemProviderSelection({
  items: descriptors,
  getCapabilityId: (descriptor) => descriptor.providesFor,
  getProviderId: (descriptor) => descriptor.id,
  configuredProviders: {
    checkout: 'payment-provider-stripe',
  },
});

console.log(result.providersByCapability);
// Map { checkout => ['payment-provider-invoice', 'payment-provider-stripe'] }

console.log(result.selections);
// Map { checkout => { selectedProviderId: 'payment-provider-stripe', mode: 'configured', ... } }

console.log(result.mismatches);
// []

console.log(result.excludedProviderIds);
// ['payment-provider-invoice']
