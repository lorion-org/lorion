import {
  defineContribution,
  defineContributionPoint,
  type ContributionModule,
} from '@lorion-org/contributions';
import type { Shop } from '../shops/contracts';
const point = defineContributionPoint<Shop>({ owner: 'shops', point: 'shop' });
export const contributionModule: ContributionModule = {
  id: 'shop-coffee',
  version: '2.0.0-beta.1',
  create: () => ({
    contributions: [
      defineContribution(point, [
        {
          id: 'shop-coffee',
          value: {
            id: 'shop-coffee',
            name: 'Bean Supply Beta 2',
            path: '/shops/coffee',
            tagline: 'Coffee beans, brewing gear, and subscriptions.',
          },
        },
      ]),
    ],
  }),
};
