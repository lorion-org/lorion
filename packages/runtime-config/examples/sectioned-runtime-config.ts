import {
  getPublicRuntimeConfigScope,
  projectSectionedRuntimeConfig,
  resolveRuntimeConfigValue,
  type RuntimeConfigFragmentMap,
} from '@lorion-org/runtime-config';

const fragments: RuntimeConfigFragmentMap = new Map([
  [
    'billing',
    {
      public: {
        apiBase: '/api/billing',
      },
      private: {
        apiSecret: 'secret',
      },
      contexts: {
        tenantA: {
          public: {
            apiBase: '/tenant-a/billing',
          },
        },
      },
    },
  ],
  [
    'mail',
    {
      public: {
        apiBase: '/api/mail',
      },
    },
  ],
]);

const runtimeConfig = projectSectionedRuntimeConfig(fragments);
const tenantApiBase = resolveRuntimeConfigValue(runtimeConfig.public, 'billing', 'apiBase', {
  contextId: 'tenantA',
});

console.log(runtimeConfig.public.billingApiBase);
// '/api/billing'

console.log(runtimeConfig.private.billingApiSecret);
// 'secret'

console.log(tenantApiBase);
// '/tenant-a/billing'

console.log(getPublicRuntimeConfigScope(runtimeConfig, 'billing'));
// { apiBase: '/api/billing' }
