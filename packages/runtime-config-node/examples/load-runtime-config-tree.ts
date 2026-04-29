import { projectSectionedRuntimeConfig } from '@lorion-org/runtime-config';
import { loadRuntimeConfigTree, writeRuntimeConfigFragment } from '@lorion-org/runtime-config-node';

writeRuntimeConfigFragment('./var', 'billing', {
  public: {
    apiBase: '/api/billing',
  },
});

const fragments = loadRuntimeConfigTree('./var');
const runtimeConfig = projectSectionedRuntimeConfig(fragments);

console.log(runtimeConfig.public);
// { billingApiBase: '/api/billing' }

console.log(runtimeConfig.private);
// {}
