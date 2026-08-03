import {
  providerSelection,
  resolvedCapabilityIds,
  selectedCapabilityIds,
} from 'virtual:capabilities';
import type { HostRuntime } from './plugin';
import {
  PAYMENT_PROVIDER_EXTENSION,
  type PaymentCheckoutProvider,
} from '../capabilities/payments/src';

// The capabilities that exist on disk. The loader resolves a subset; the rest are
// "not injected" for the selected profile.
export const discoveredCapabilityIds = [
  'admin',
  'checkout',
  'payment-provider-invoice',
  'payment-provider-stripe',
  'payments',
  'shop-coffee',
  'shop-stationery',
  'shops',
  'web',
];

export function createDemoOverview(runtime: HostRuntime) {
  const resolvedSet = new Set(resolvedCapabilityIds);
  // Model B resolves provider selection at build time, so exactly the selected
  // provider is present in the graph (no runtime candidate list).
  const providers = runtime.get<PaymentCheckoutProvider>(PAYMENT_PROVIDER_EXTENSION);

  return {
    selectedCapabilityIds,
    resolvedCapabilityIds: [...resolvedCapabilityIds].sort((left, right) =>
      left.localeCompare(right),
    ),
    notInjectedCapabilityIds: discoveredCapabilityIds.filter((id) => !resolvedSet.has(id)),
    selectedProviderIds: providers.map((provider) => provider.id),
    providerSelection,
  };
}
