import {
  createContributionContract,
  getCapabilityProviderSelection,
  useCapabilityRuntime,
  type CapabilityContribution,
  type CapabilityRuntime,
} from '@lorion-org/react';
import type { ProviderSelection } from '@lorion-org/provider-selection';

export type CheckoutInput = {
  shopId: string;
};

export type PaymentCheckoutProvider = {
  createCheckoutPath: (input: CheckoutInput) => string;
  id: string;
  label: string;
};

export type PaymentSelectionOverview = {
  excludedProviderIds: string[];
  mismatches: Array<{ capabilityId: string; configuredProviderId: string }>;
  selections: Record<string, ProviderSelection>;
};

export const PAYMENT_PROVIDER_CONTRACT = createContributionContract<PaymentCheckoutProvider>(
  'acme.payment-checkout-providers',
);
export const PAYMENT_PROVIDER_EXTENSION = PAYMENT_PROVIDER_CONTRACT.extensionPoint;

export function definePaymentCheckoutProviders(
  providers: readonly PaymentCheckoutProvider[],
): CapabilityContribution<PaymentCheckoutProvider> {
  return PAYMENT_PROVIDER_CONTRACT.define(providers);
}

export function getPaymentProviders(runtime: CapabilityRuntime): PaymentCheckoutProvider[] {
  return PAYMENT_PROVIDER_CONTRACT.get(runtime);
}

export function getPaymentSelectionOverview(runtime: CapabilityRuntime): PaymentSelectionOverview {
  const resolution = getCapabilityProviderSelection(runtime);

  return {
    excludedProviderIds: resolution.excludedProviderIds,
    mismatches: resolution.mismatches,
    selections: Object.fromEntries(resolution.selections),
  };
}

export function getPaymentProvider(
  runtime: CapabilityRuntime,
  capabilityId = 'checkout',
): PaymentCheckoutProvider | undefined {
  const selectedProviderId =
    getPaymentSelectionOverview(runtime).selections[capabilityId]?.selectedProviderId;

  return selectedProviderId
    ? getPaymentProviders(runtime).find((provider) => provider.id === selectedProviderId)
    : undefined;
}

export function usePaymentProvider(): PaymentCheckoutProvider | undefined {
  return getPaymentProvider(useCapabilityRuntime());
}

export function usePaymentSelectionOverview(): PaymentSelectionOverview {
  return getPaymentSelectionOverview(useCapabilityRuntime());
}
