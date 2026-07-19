import {
  getRuntimeConfigScopeView,
  getRuntimeConfigValue,
  listRuntimeConfigFragments,
  projectRuntimeConfigTree,
  writeRuntimeConfigFragment,
} from '@lorion-org/runtime-config-node';

writeRuntimeConfigFragment('./var', 'checkout', {
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
});

const listResult = listRuntimeConfigFragments('./var');
console.log(listResult.scopes);
// [{ scopeId: 'checkout', publicKeys: ['successPath'], privateKeys: ['signingSecret'], contextIds: ['eu-store'], ... }]

const projectResult = projectRuntimeConfigTree('./var', {
  contextOutputKey: '__stores',
});
console.log(projectResult.runtimeConfig.public);
// {
//   checkoutSuccessPath: '/orders/confirmed',
//   __stores: {
//     'eu-store': {
//       checkoutSuccessPath: '/eu-store/orders/confirmed',
//     },
//   },
// }

const valueResult = getRuntimeConfigValue('./var', 'checkout', 'successPath', {
  contextId: 'eu-store',
  contextOutputKey: '__stores',
});
console.log(valueResult.value);
// /eu-store/orders/confirmed

const scopeResult = getRuntimeConfigScopeView('./var', 'checkout', {
  visibility: 'private',
});
console.log(scopeResult.config);
// { signingSecret: 'checkout_signing_secret_demo' }
