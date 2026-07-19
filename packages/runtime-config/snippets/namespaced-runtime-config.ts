import {
  projectRuntimeConfigNamespace,
  projectRuntimeConfigNamespaces,
} from '@lorion-org/runtime-config';

const checkoutRuntimeConfig = projectRuntimeConfigNamespace('checkout', {
  public: {
    successPath: '/orders/confirmed',
  },
  private: {
    signingSecret: 'checkout_signing_secret_demo',
  },
});

console.log(checkoutRuntimeConfig.public.checkout);
// { successPath: '/orders/confirmed' }

console.log(checkoutRuntimeConfig.checkout);
// { signingSecret: 'checkout_signing_secret_demo' }

const combinedRuntimeConfig = projectRuntimeConfigNamespaces([
  {
    scopeId: 'checkout',
    config: {
      public: {
        successPath: '/orders/confirmed',
      },
      private: {
        signingSecret: 'checkout_signing_secret_demo',
      },
    },
  },
  {
    scopeId: 'payments',
    config: {
      public: {
        configuredProvider: 'payment-provider-stripe',
      },
    },
  },
]);

console.log(combinedRuntimeConfig.public.checkout);
// { successPath: '/orders/confirmed' }

console.log(combinedRuntimeConfig.public.payments);
// { configuredProvider: 'payment-provider-stripe' }

console.log(combinedRuntimeConfig.checkout);
// { signingSecret: 'checkout_signing_secret_demo' }
