import {
  defineContribution,
  defineContributionPoint,
  type ContributionModule,
} from '@lorion-org/contributions';
import type { PaymentCheckoutProvider } from '../payments/contracts';
const point = defineContributionPoint<PaymentCheckoutProvider>({
  owner: 'payments',
  point: 'payment-method',
});
export const contributionModule: ContributionModule = {
  id: 'payment-provider-stripe',
  version: '1.0.0',
  create: () => ({
    contributions: [
      defineContribution(point, [
        {
          id: 'payment-provider-stripe',
          value: {
            id: 'payment-provider-stripe',
            label: 'Stripe demo',
            createCheckoutPath: (input) =>
              `/providers/payment-provider-stripe/checkout?shop=${encodeURIComponent(input.shopId)}`,
          },
        },
      ]),
    ],
  }),
};
