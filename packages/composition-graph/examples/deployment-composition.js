/* eslint-env node */
import { createDescriptorCatalog } from '../dist/index.js';

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

process.stdout.write(`${selection.getResolved().join(', ')}\n`);
