import { defineContributionPoint, type ContributionModule } from '@lorion-org/contributions';
import type { PaymentCheckoutProvider } from './contracts';
export const point = defineContributionPoint<PaymentCheckoutProvider>({
  owner: 'payments',
  point: 'payment-method',
});
export const contributionModule: ContributionModule = {
  id: 'payments',
  version: '1.0.0',
  create: () => ({ points: [point] }),
};
