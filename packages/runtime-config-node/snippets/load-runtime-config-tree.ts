import { projectSectionedRuntimeConfig } from '@lorion-org/runtime-config';
import { loadRuntimeConfigTree, writeRuntimeConfigFragment } from '@lorion-org/runtime-config-node';

writeRuntimeConfigFragment('./var', 'checkout', {
  public: {
    successPath: '/orders/confirmed',
  },
});

const fragments = loadRuntimeConfigTree('./var');
const runtimeConfig = projectSectionedRuntimeConfig(fragments);

console.log(runtimeConfig.public);
// { checkoutSuccessPath: '/orders/confirmed' }

console.log(runtimeConfig.private);
// {}
