/* eslint-env node */
import { createDescriptorCatalog } from '../dist/index.js';

const catalog = createDescriptorCatalog({
  descriptors: [
    {
      id: 'web',
      version: '1.0.0',
      dependencies: {
        checkout: '^1.0.0',
        payments: '^1.0.0',
        'payment-provider-invoice': '^1.0.0',
        'payment-provider-stripe': '^1.0.0',
        shops: '^1.0.0',
      },
    },
    {
      id: 'checkout',
      version: '1.0.0',
      dependencies: { payments: '^1.0.0' },
    },
    {
      id: 'payments',
      version: '1.0.0',
    },
    {
      id: 'shops',
      version: '1.0.0',
    },
    {
      id: 'payment-provider-invoice',
      version: '1.0.0',
      providesFor: 'payment-checkout',
      dependencies: { payments: '^1.0.0' },
    },
    {
      id: 'payment-provider-stripe',
      version: '1.0.0',
      defaultFor: 'payment-checkout',
      providesFor: 'payment-checkout',
      dependencies: { payments: '^1.0.0' },
    },
  ],
});

const selection = catalog.resolveSelection({
  selected: ['web'],
});

process.stdout.write(`${selection.getResolved().join(', ')}\n`);
