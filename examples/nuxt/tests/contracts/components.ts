import { defineContribution, defineContributionPoint } from '@lorion-org/contributions';
import { defineComponent } from 'vue';
import type { CheckoutAction } from '../../layer-extensions/checkout/contracts';
import GiftWrap from '../../layer-extensions/gift-wrap/Action.vue';
import wrong from './WrongShopId.vue';
import extra from './ExtraRequired.vue';
export function checkComponentContracts(): void {
  const point = defineContributionPoint<CheckoutAction>({ owner: 'checkout', point: 'actions' });
  defineContribution(point, [{ id: 'sfc', value: { component: GiftWrap } }]);
  const optional = defineComponent({
    props: { shopId: { type: String, required: true }, note: String },
    setup: () => ({ localState: 1 }),
  });
  defineContribution(point, [{ id: 'optional', value: { component: optional } }]);

  // @ts-expect-error The owner supplies a string shop ID.
  defineContribution(point, [{ id: 'wrong', value: { component: wrong } }]);
  // @ts-expect-error The owner does not supply additional required component props.
  defineContribution(point, [{ id: 'extra', value: { component: extra } }]);
}
