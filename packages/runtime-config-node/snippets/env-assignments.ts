import {
  loadRuntimeConfigShellAssignments,
  writeRuntimeConfigFragment,
} from '@lorion-org/runtime-config-node';

writeRuntimeConfigFragment('./var', 'checkout', {
  public: {
    successPath: '/orders/confirmed',
  },
  private: {
    signingSecret: 'checkout_signing_secret_demo',
  },
});

const assignments = loadRuntimeConfigShellAssignments('./var', {
  prefix: 'APP',
});

console.log(assignments);
// APP_PUBLIC_CHECKOUT_SUCCESS_PATH='"/orders/confirmed"'
// APP_PRIVATE_CHECKOUT_SIGNING_SECRET='"checkout_signing_secret_demo"'
