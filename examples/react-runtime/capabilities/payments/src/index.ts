import { useContributions, type ContributionRuntime } from '@lorion-org/react/contributions';
import { providerSelection } from 'virtual:capabilities';
import { point } from '../contributions';
import type { PaymentCheckoutProvider } from '../contracts';
export type { CheckoutInput, PaymentCheckoutProvider } from '../contracts';
function selected(
  providers: readonly PaymentCheckoutProvider[],
): PaymentCheckoutProvider | undefined {
  const slot = providerSelection.slots.find((entry) => entry.capabilityId === 'checkout');
  const id = slot?.state === 'selected' ? slot.selectedProviderId : undefined;
  return providers.find((provider) => provider.id === id);
}
export function getPaymentProviders(runtime: ContributionRuntime): PaymentCheckoutProvider[] {
  return runtime.get(point).map(({ value }) => value);
}
export function getPaymentProvider(
  runtime: ContributionRuntime,
): PaymentCheckoutProvider | undefined {
  return selected(getPaymentProviders(runtime));
}
export function usePaymentProvider(): PaymentCheckoutProvider | undefined {
  return selected(useContributions(point).map(({ value }) => value));
}
