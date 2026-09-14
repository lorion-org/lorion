import {
  defineContribution,
  defineContributionPoint,
  type ContributionModule,
} from '@lorion-org/react/contributions';
import type { PaymentCheckoutProvider } from '../payments/contracts';
const point = defineContributionPoint<PaymentCheckoutProvider>({
  owner: 'payments',
  point: 'payment-method',
});
export const contributionModule: ContributionModule = {
  id: 'payment-provider-invoice',
  version: '1.0.0',
  create: () => ({
    contributions: [
      defineContribution(point, [
        {
          id: 'payment-provider-invoice',
          value: {
            id: 'payment-provider-invoice',
            label: 'Invoice demo',
            createCheckoutPath: (input) =>
              `/providers/payment-provider-invoice/checkout?shop=${encodeURIComponent(input.shopId)}`,
          },
        },
      ]),
    ],
  }),
};
