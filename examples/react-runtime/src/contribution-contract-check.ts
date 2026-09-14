import { defineContribution, defineContributionPoint } from '@lorion-org/contributions';
import type { CheckoutAction } from '../capabilities/checkout/contracts';

export function checkComponentContracts(): void {
  const point = defineContributionPoint<CheckoutAction>({ owner: 'checkout', point: 'actions' });
  const valid = (_props: { shopId: string; note?: string }) => {
    void _props;
    return null;
  };
  defineContribution(point, [{ id: 'valid', value: { component: valid } }]);
  const wrong = (_props: { shopId: number }) => {
    void _props;
    return null;
  };
  // @ts-expect-error The owner supplies a string shop ID.
  defineContribution(point, [{ id: 'wrong', value: { component: wrong } }]);
  const extra = (_props: { shopId: string; requiredToken: string }) => {
    void _props;
    return null;
  };
  // @ts-expect-error The owner does not supply additional required component props.
  defineContribution(point, [{ id: 'extra', value: { component: extra } }]);
}
