import {
  projectSectionedRuntimeConfig,
  resolveRuntimeConfigValue,
} from '@lorion-org/runtime-config';

const runtimeConfig = projectSectionedRuntimeConfig(
  [
    {
      scopeId: 'billing',
      config: {
        public: {
          apiBase: '/api/billing',
        },
        tenants: {
          tenantA: {
            public: {
              apiBase: '/tenant-a/billing',
            },
          },
        },
      },
    },
  ],
  {
    contextInputKey: 'tenants',
    contextOutputKey: '__tenants',
  },
);

console.log(runtimeConfig.public);
// {
//   billingApiBase: '/api/billing',
//   __tenants: {
//     tenantA: {
//       billingApiBase: '/tenant-a/billing'
//     }
//   }
// }

console.log(
  resolveRuntimeConfigValue(runtimeConfig.public, 'billing', 'apiBase', {
    contextId: 'tenantA',
    contextOutputKey: '__tenants',
  }),
);
// '/tenant-a/billing'
