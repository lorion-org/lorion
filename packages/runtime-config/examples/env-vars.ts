import {
  runtimeEnvVarsToShellAssignments,
  runtimeEnvVarsToString,
  toRuntimeEnvVars,
} from '@lorion-org/runtime-config';

const envVars = toRuntimeEnvVars(
  {
    public: {
      billingApiBase: '/api/billing',
    },
    private: {
      billingApiSecret: 'secret',
    },
  },
  'APP',
);

console.log(runtimeEnvVarsToString(envVars));
// APP_PUBLIC_BILLING_API_BASE=/api/billing
// APP_PRIVATE_BILLING_API_SECRET=secret

console.log(runtimeEnvVarsToShellAssignments(envVars));
// APP_PUBLIC_BILLING_API_BASE='"/api/billing"'
// APP_PRIVATE_BILLING_API_SECRET='"secret"'
