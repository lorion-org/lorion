import { defineContributionPoint, type ContributionModule } from '@lorion-org/contributions';
import type { CheckoutAction } from './contracts';
export const point = defineContributionPoint<CheckoutAction>({
  owner: 'checkout',
  point: 'actions',
});
export const contributionModule: ContributionModule = {
  id: 'checkout',
  version: '1.0.0',
  create: () => ({ points: [point] }),
};
