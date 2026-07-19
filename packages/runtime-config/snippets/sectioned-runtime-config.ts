import {
  getPublicRuntimeConfigScope,
  projectSectionedRuntimeConfig,
  resolveRuntimeConfigValue,
  type RuntimeConfigFragmentMap,
} from '@lorion-org/runtime-config';

const fragments: RuntimeConfigFragmentMap = new Map([
  [
    'checkout',
    {
      public: {
        successPath: '/orders/confirmed',
      },
      private: {
        signingSecret: 'checkout_signing_secret_demo',
      },
      contexts: {
        'eu-store': {
          public: {
            successPath: '/eu-store/orders/confirmed',
          },
        },
      },
    },
  ],
  [
    'payments',
    {
      public: {
        configuredProvider: 'payment-provider-stripe',
      },
    },
  ],
]);

const runtimeConfig = projectSectionedRuntimeConfig(fragments);
const euStoreSuccessPath = resolveRuntimeConfigValue(
  runtimeConfig.public,
  'checkout',
  'successPath',
  {
    contextId: 'eu-store',
  },
);

console.log(runtimeConfig.public.checkoutSuccessPath);
// '/orders/confirmed'

console.log(runtimeConfig.private.checkoutSigningSecret);
// 'checkout_signing_secret_demo'

console.log(euStoreSuccessPath);
// '/eu-store/orders/confirmed'

console.log(getPublicRuntimeConfigScope(runtimeConfig, 'checkout'));
// { successPath: '/orders/confirmed' }
