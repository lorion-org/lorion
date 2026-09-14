import {
  defineContribution,
  defineContributionPoint,
  type ContributionModule,
} from '@lorion-org/contributions';
import type { Counter } from '../owner/contracts';
const point = defineContributionPoint<Counter>({ owner: 'owner', point: 'counter' });
export const contributionModule: ContributionModule = {
  id: 'guest',
  version: '1.0.0',
  create: () => ({
    contributions: [defineContribution(point, [{ id: 'counter', value: { count: 0 } }])],
  }),
};
