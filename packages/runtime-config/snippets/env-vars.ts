import {
  runtimeEnvVarsToShellAssignments,
  runtimeEnvVarsToString,
  toRuntimeEnvVars,
} from '@lorion-org/runtime-config';

const envVars = toRuntimeEnvVars(
  {
    public: {
      checkoutSuccessPath: '/orders/confirmed',
    },
    private: {
      checkoutSigningSecret: 'checkout_signing_secret_demo',
    },
  },
  'APP',
);

console.log(runtimeEnvVarsToString(envVars));
// APP_PUBLIC_CHECKOUT_SUCCESS_PATH=/orders/confirmed
// APP_PRIVATE_CHECKOUT_SIGNING_SECRET=checkout_signing_secret_demo

console.log(runtimeEnvVarsToShellAssignments(envVars));
// APP_PUBLIC_CHECKOUT_SUCCESS_PATH='"/orders/confirmed"'
// APP_PRIVATE_CHECKOUT_SIGNING_SECRET='"checkout_signing_secret_demo"'
