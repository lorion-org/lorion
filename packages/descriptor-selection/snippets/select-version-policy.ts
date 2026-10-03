import { selectDescriptorsWithProviders } from '@lorion-org/descriptor-selection';
import type { Descriptor } from '@lorion-org/composition-graph';
import policy from './version-policy.json';

const result = selectDescriptorsWithProviders<Descriptor>({
  items: [
    { id: 'search', version: '1.0.0' },
    { id: 'search', version: '2.0.0-beta.1+reviewed' },
    { id: 'search', version: '2.0.0-beta.1+other' },
    { id: 'search', version: '3.0.0-beta.2' },
  ],
  getDescriptor: (descriptor) => descriptor,
  withDescriptor: (_item, descriptor) => descriptor,
  seed: {
    selected: ['search@curated'],
    selectionSeed: false,
    versionSelectors: {
      curated: ({ id, version }) =>
        policy.curated.some((candidate) => candidate.id === id && candidate.version === version),
    },
  },
});

console.log(result.items[0]?.version);
// 2.0.0-beta.1+reviewed: the caller's list excludes the other build and v3.
console.log(result.seed.requirements);
