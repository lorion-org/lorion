import {
  defineContribution,
  defineContributionPoint,
  type ContributionModule,
} from '@lorion-org/react/contributions';
import type { Shop } from '../shops/contracts';
const point = defineContributionPoint<Shop>({ owner: 'shops', point: 'shop' });
export const contributionModule: ContributionModule = {
  id: 'shop-stationery',
  version: '1.0.0',
  create: () => ({
    contributions: [
      defineContribution(point, [
        {
          id: 'shop-stationery',
          value: {
            id: 'shop-stationery',
            name: 'Paper Desk',
            path: '/shops/stationery',
            slug: 'stationery',
            tagline: 'Notebooks, pens, and desk basics.',
          },
        },
      ]),
    ],
  }),
};
