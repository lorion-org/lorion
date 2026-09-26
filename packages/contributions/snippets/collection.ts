import { defineContribution, defineContributionPoint } from '@lorion-org/contributions';
const actions = defineContributionPoint<{ label: string }>({ owner: 'checkout', point: 'actions' });
export const giftWrap = defineContribution(actions, [
  { id: 'gift-wrap', order: 10, value: { label: 'Gift wrap' } },
]);
