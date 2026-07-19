import {
  getPrivateRuntimeConfigScope,
  getPublicRuntimeConfigScope,
  projectRuntimeConfigFragment,
  toRuntimeEnvVars,
} from '@lorion-org/runtime-config';

const runtimeConfig = projectRuntimeConfigFragment('checkout', {
  public: {
    currency: 'EUR',
    successPath: '/orders/confirmed',
  },
  private: {
    signingSecret: 'checkout_signing_secret_demo',
  },
});

console.log(runtimeConfig.public.checkoutCurrency);
// 'EUR'

console.log(toRuntimeEnvVars(runtimeConfig, 'APP'));
// {
//   APP_PUBLIC_CHECKOUT_CURRENCY: 'EUR',
//   APP_PUBLIC_CHECKOUT_SUCCESS_PATH: '/orders/confirmed',
//   APP_PRIVATE_CHECKOUT_SIGNING_SECRET: 'checkout_signing_secret_demo'
// }

console.log(getPublicRuntimeConfigScope(runtimeConfig, 'checkout'));
// { currency: 'EUR', successPath: '/orders/confirmed' }

console.log(getPrivateRuntimeConfigScope(runtimeConfig, 'checkout'));
// { signingSecret: 'checkout_signing_secret_demo' }
