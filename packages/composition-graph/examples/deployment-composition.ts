import { createDescriptorCatalog } from '@lorion-org/composition-graph';

const catalog = createDescriptorCatalog({
  relationDescriptors: [
    {
      id: 'integrations',
      field: 'integrations',
    },
  ],
  descriptors: [
    {
      id: 'billing',
      version: '1.0.0',
      dependencies: { storage: '*' },
      integrations: { analytics: '*' },
    },
    {
      id: 'storage',
      version: '1.0.0',
    },
    {
      id: 'analytics',
      version: '1.0.0',
    },
    {
      id: 'ui-shell',
      version: '1.0.0',
      dependencies: { router: '*' },
    },
    {
      id: 'router',
      version: '1.0.0',
    },
  ],
});

const selection = catalog.resolveSelection({
  selected: ['billing'],
  baseDescriptors: ['ui-shell'],
});

console.log(selection.getResolved());
// ['analytics', 'billing', 'router', 'storage', 'ui-shell']

console.log(selection.getProvenance());
// [
//   { descriptorId: 'analytics', origins: ['resolved'] },
//   { descriptorId: 'billing', origins: ['selected'] },
//   { descriptorId: 'router', origins: ['resolved'] },
//   { descriptorId: 'storage', origins: ['resolved'] },
//   { descriptorId: 'ui-shell', origins: ['base'] }
// ]
