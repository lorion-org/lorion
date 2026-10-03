import {
  defineContribution,
  defineContributionPoint,
  type ContributionModule,
} from '@lorion-org/react/contributions';
import type { Shop } from '../shops/contracts';
const point = defineContributionPoint<Shop>({ owner: 'shops', point: 'shop' });
export const contributionModule: ContributionModule = {
  id: 'shop-coffee',
  version: '3.0.0-beta.2',
  create: () => ({
    contributions: [
      defineContribution(point, [
        {
          id: 'shop-coffee',
          value: {
            id: 'shop-coffee',
            name: 'Bean Supply Beta 3',
            path: '/shops/coffee',
            slug: 'coffee',
            tagline: 'Coffee beans, brewing gear, and subscriptions.',
          },
        },
      ]),
    ],
  }),
};
