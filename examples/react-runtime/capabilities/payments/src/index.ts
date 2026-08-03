import {
  createContributionContract,
  useCapabilityRuntime,
  type CapabilityContribution,
  type CapabilityRuntime,
} from '@lorion-org/react';

export type CheckoutInput = {
  shopId: string;
};

export type PaymentCheckoutProvider = {
  createCheckoutPath: (input: CheckoutInput) => string;
  id: string;
  label: string;
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

export function getPaymentProvider(
  runtime: CapabilityRuntime,
): PaymentCheckoutProvider | undefined {
  const providers = getPaymentProviders(runtime);
  if (providers.length > 1) {
    throw new Error(
      `Expected at most one active checkout provider, received: ${providers
        .map((provider) => provider.id)
        .join(', ')}.`,
    );
  }

  return providers[0];
}

export function usePaymentProvider(): PaymentCheckoutProvider | undefined {
  return getPaymentProvider(useCapabilityRuntime());
}
