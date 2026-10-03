import { selectDescriptorsWithProviders } from '@lorion-org/descriptor-selection';
import type { Descriptor } from '@lorion-org/composition-graph';

const result = selectDescriptorsWithProviders<Descriptor>({
  items: [
    { id: 'search', version: '2.0.0' },
    { id: 'search', version: '2.0.0-beta.1' },
    { id: 'search', version: '3.0.0-beta.2' },
    { id: 'app', version: '1.0.0', dependencies: { search: '^2.0.0-beta.0' } },
  ],
  getDescriptor: (descriptor) => descriptor,
  withDescriptor: (_item, descriptor) => descriptor,
  seed: {
    selected: ['app', 'search@beta'],
    selectionSeed: false,
    versionSelectors: { beta: ({ prerelease }) => prerelease[0] === 'beta' },
  },
});

console.log(result.items.find(({ id }) => id === 'search')?.version);
// 2.0.0-beta.1: the channel includes v3, but the active app requires the v2 beta.
console.log(result.versions.find(({ id }) => id === 'search')?.requirements);
