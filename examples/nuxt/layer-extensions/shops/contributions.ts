import { defineContributionPoint, type ContributionModule } from '@lorion-org/contributions';
import type { Shop } from './contracts';
export const point = defineContributionPoint<Shop>({ owner: 'shops', point: 'shop' });
export const contributionModule: ContributionModule = {
  id: 'shops',
  version: '1.0.0',
  create: () => ({ points: [point] }),
};
