import {
  defineContributionPoint,
  defineContribution,
  createContributionRuntime,
  type ContributionModule,
  type ContributionPlan,
} from '@lorion-org/contributions';
const point = defineContributionPoint<{ label: string }>({ owner: 'checkout', point: 'actions' });
defineContribution(point, [{ id: 'x', value: { label: 'x' } }]);
// @ts-expect-error The point, not the item, fixes the payload type.
defineContribution(point, [{ id: 'x', value: { label: 1 } }]);
defineContribution(point, [
  { id: 'x', value: { label: 'x' } },
  // @ts-expect-error A point payload cannot be widened by another item.
  { id: 'y', value: 'wrong' },
]);
// @ts-expect-error Module factories are synchronous declarations.
const asynchronous: ContributionModule = { id: 'x', version: '1', create: async () => ({}) };
const runtime = createContributionRuntime({
  plan: { selected: [], points: [], edges: [] },
  modules: [],
});
// @ts-expect-error Collection structure is readonly.
runtime.get(point).push({ id: 'x', order: 0, value: { label: 'x' } });
const invalid: ContributionPlan = {
  selected: [],
  points: [],
  // @ts-expect-error Inactive edges have no selected owner version.
  edges: [{ source: { id: 'x', version: '1' }, target: point, active: false, ownerVersion: '1' }],
};
export { asynchronous, invalid };

type ActionValue = { kind: 'label'; label: string } | { kind: 'count'; count: number };
const unionPoint = defineContributionPoint<ActionValue>({ owner: 'checkout', point: 'variants' });
defineContribution(unionPoint, [
  { id: 'label', value: { kind: 'label', label: 'Valid' } },
  { id: 'count', value: { kind: 'count', count: 1 } },
]);
// @ts-expect-error A discriminant cannot widen the owner's declared union.
defineContribution(unionPoint, [{ id: 'bad', value: { kind: 'unknown', label: 'Bad' } }]);
// @ts-expect-error The selected union member requires its payload property.
defineContribution(unionPoint, [{ id: 'missing', value: { kind: 'label' } }]);
