import {
  loadRuntimeConfigShellAssignments,
  writeRuntimeConfigFragment,
} from '@lorion-org/runtime-config-node';

writeRuntimeConfigFragment('./var', 'billing', {
  public: {
    apiBase: '/api/billing',
  },
  private: {
    token: 'billing-token',
  },
});

const assignments = loadRuntimeConfigShellAssignments('./var', {
  prefix: 'APP',
});

console.log(assignments);
// APP_PUBLIC_BILLING_API_BASE='"/api/billing"'
// APP_PRIVATE_BILLING_TOKEN='"billing-token"'
