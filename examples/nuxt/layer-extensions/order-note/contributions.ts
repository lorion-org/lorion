import {
  defineContribution,
  defineContributionPoint,
  type ContributionModule,
} from '@lorion-org/contributions';
import type { CheckoutAction } from '../checkout/contracts';
import Action from './Action.vue';
const point = defineContributionPoint<CheckoutAction>({ owner: 'checkout', point: 'actions' });
export const contributionModule: ContributionModule = {
  id: 'order-note',
  version: '1.0.0',
  create: () => ({
    contributions: [
      defineContribution(point, [{ id: 'order-note', order: 20, value: { component: Action } }]),
    ],
  }),
};
