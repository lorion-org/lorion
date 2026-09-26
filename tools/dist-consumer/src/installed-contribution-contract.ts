import type { Action } from '@lorion-fixtures/contribution-owner/contracts';
import {
  defineContribution,
  defineContributionPoint,
  type ContributionModule,
} from '@lorion-org/contributions';
const point = defineContributionPoint<Action>({ owner: 'fixture-owner', point: 'actions' });
export const contributionModule: ContributionModule = {
  id: 'fixture-guest',
  version: '1.0.0',
  create: () => ({
    contributions: [
      defineContribution(point, [{ id: 'action', value: { label: 'Installed contract' } }]),
    ],
  }),
};
// @ts-expect-error The installed public contract constrains the payload.
defineContribution(point, [{ id: 'bad', value: { label: 1 } }]);
