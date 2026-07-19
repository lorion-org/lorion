import type { CapabilityRuntime } from '@lorion-org/react';
import { selectedCapabilityIds } from 'virtual:capabilities';
import { getPaymentSelectionOverview } from '../capabilities/payments/src';

export const discoveredCapabilityIds = [
  'admin',
  'checkout',
  'default',
  'payment-provider-invoice',
  'payment-provider-stripe',
  'payments',
  'shop-coffee',
  'shop-stationery',
  'shops',
  'web',
];

export function createDemoOverview(runtime: CapabilityRuntime) {
  const resolvedCapabilityIds = runtime.catalog
    .getAllDescriptors()
    .map((descriptor) => descriptor.id)
    .sort((left, right) => left.localeCompare(right));
  const resolvedSet = new Set(resolvedCapabilityIds);

  return {
    capabilitySelection: {
      discoveredCapabilityIds,
      notInjectedCapabilityIds: discoveredCapabilityIds.filter((id) => !resolvedSet.has(id)),
      resolvedCapabilityIds,
      selectedCapabilityIds,
    },
    providerSelection: getPaymentSelectionOverview(runtime),
  };
}
