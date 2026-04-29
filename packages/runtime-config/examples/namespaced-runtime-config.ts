import {
  projectRuntimeConfigNamespace,
  projectRuntimeConfigNamespaces,
} from '@lorion-org/runtime-config';

const billingRuntimeConfig = projectRuntimeConfigNamespace('billing', {
  public: {
    apiBase: '/api/billing',
  },
  private: {
    token: 'billing-token',
  },
});

console.log(billingRuntimeConfig.public.billing);
// { apiBase: '/api/billing' }

console.log(billingRuntimeConfig.billing);
// { token: 'billing-token' }

const combinedRuntimeConfig = projectRuntimeConfigNamespaces([
  {
    scopeId: 'billing',
    config: {
      public: {
        apiBase: '/api/billing',
      },
      private: {
        token: 'billing-token',
      },
    },
  },
  {
    scopeId: 'mail',
    config: {
      public: {
        apiBase: '/api/mail',
      },
    },
  },
]);

console.log(combinedRuntimeConfig.public.billing);
// { apiBase: '/api/billing' }

console.log(combinedRuntimeConfig.public.mail);
// { apiBase: '/api/mail' }

console.log(combinedRuntimeConfig.billing);
// { token: 'billing-token' }
