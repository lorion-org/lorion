import {
  collectProviderDefaults,
  collectProviderPreferences,
  collectSelectedProviderPreferences,
  resolveItemProviderSelection,
} from '@lorion-org/provider-selection';

type ExampleDescriptor = {
  defaultFor?: string | string[];
  id: string;
  providerPreferences?: Record<string, string>;
  providesFor?: string | string[];
};

const descriptors: ExampleDescriptor[] = [
  {
    id: 'web',
    providerPreferences: {
      checkout: 'payment-provider-stripe',
    },
  },
  {
    id: 'payment-provider-stripe',
    defaultFor: 'checkout',
    providesFor: 'checkout',
  },
  {
    id: 'payment-provider-invoice',
    providesFor: 'checkout',
  },
];

const providerDefaults = collectProviderDefaults({
  items: descriptors,
  getDefaultFor: (descriptor) => descriptor.defaultFor,
  getProviderId: (descriptor) => descriptor.id,
});
const descriptorPreferences = collectProviderPreferences({
  items: descriptors,
  getProviderPreferences: (descriptor) => descriptor.providerPreferences,
});
const selectedProviders = collectSelectedProviderPreferences({
  items: descriptors,
  getCapabilityId: (descriptor) => descriptor.providesFor,
  getProviderId: (descriptor) => descriptor.id,
  selectedProviderIds: ['payment-provider-invoice'],
});

const result = resolveItemProviderSelection({
  items: descriptors,
  getCapabilityId: (descriptor) => descriptor.providesFor,
  getProviderId: (descriptor) => descriptor.id,
  fallbackProviders: {
    ...providerDefaults,
    ...descriptorPreferences,
  },
  selectedProviders,
});

console.log(Object.fromEntries(result.selections));
// { checkout: { selectedProviderId: 'payment-provider-invoice', mode: 'selected', ... } }
