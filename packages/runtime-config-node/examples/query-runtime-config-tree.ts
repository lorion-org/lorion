import {
  getRuntimeConfigScopeView,
  getRuntimeConfigValue,
  listRuntimeConfigFragments,
  projectRuntimeConfigTree,
  writeRuntimeConfigFragment,
} from '@lorion-org/runtime-config-node';

writeRuntimeConfigFragment('./var', 'billing', {
  public: {
    apiBase: '/api/billing',
  },
  private: {
    token: 'billing-token',
  },
  contexts: {
    tenantA: {
      public: {
        apiBase: '/tenant-a/billing',
      },
    },
  },
});

const listResult = listRuntimeConfigFragments('./var');
console.log(listResult.scopes);
// [{ scopeId: 'billing', publicKeys: ['apiBase'], privateKeys: ['token'], contextIds: ['tenantA'], ... }]

const projectResult = projectRuntimeConfigTree('./var', {
  contextOutputKey: '__tenants',
});
console.log(projectResult.runtimeConfig.public);
// {
//   billingApiBase: '/api/billing',
//   __tenants: {
//     tenantA: {
//       billingApiBase: '/tenant-a/billing',
//     },
//   },
// }

const valueResult = getRuntimeConfigValue('./var', 'billing', 'apiBase', {
  contextId: 'tenantA',
  contextOutputKey: '__tenants',
});
console.log(valueResult.value);
// /tenant-a/billing

const scopeResult = getRuntimeConfigScopeView('./var', 'billing', {
  visibility: 'private',
});
console.log(scopeResult.config);
// { token: 'billing-token' }
