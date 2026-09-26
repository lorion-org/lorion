import { defineContributionPoint, type ContributionModule } from '@lorion-org/contributions';
import type { Counter } from './contracts';
export const point = defineContributionPoint<Counter>({ owner: 'owner', point: 'counter' });
export const contributionModule: ContributionModule = {
  id: 'owner',
  version: '1.0.0',
  create: () => ({ points: [point] }),
};
