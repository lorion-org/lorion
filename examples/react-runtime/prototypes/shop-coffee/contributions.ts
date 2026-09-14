import {
  defineContribution,
  defineContributionPoint,
  type ContributionModule,
} from '@lorion-org/react/contributions';
import type { Shop } from '../../capabilities/shops/contracts';
const point = defineContributionPoint<Shop>({ owner: 'shops', point: 'shop' });
export const contributionModule: ContributionModule = {
  id: 'shop-coffee',
  version: '1.0.0',
  create: () => ({
    contributions: [
      defineContribution(point, [
        {
          id: 'shop-coffee',
          value: {
            id: 'shop-coffee',
            name: 'Bean Supply',
            path: '/shops/coffee',
            slug: 'coffee',
            tagline: 'Coffee beans and simple brewing gear.',
          },
        },
      ]),
    ],
  }),
};
