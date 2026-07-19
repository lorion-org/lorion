import {
  projectSectionedRuntimeConfig,
  resolveRuntimeConfigValue,
} from '@lorion-org/runtime-config';

const runtimeConfig = projectSectionedRuntimeConfig(
  [
    {
      scopeId: 'checkout',
      config: {
        public: {
          successPath: '/orders/confirmed',
        },
        stores: {
          'eu-store': {
            public: {
              successPath: '/eu-store/orders/confirmed',
            },
          },
        },
      },
    },
  ],
  {
    contextInputKey: 'stores',
    contextOutputKey: '__stores',
  },
);

console.log(runtimeConfig.public);
// {
//   checkoutSuccessPath: '/orders/confirmed',
//   __stores: {
//     'eu-store': {
//       checkoutSuccessPath: '/eu-store/orders/confirmed'
//     }
//   }
// }

console.log(
  resolveRuntimeConfigValue(runtimeConfig.public, 'checkout', 'successPath', {
    contextId: 'eu-store',
    contextOutputKey: '__stores',
  }),
);
// '/eu-store/orders/confirmed'
