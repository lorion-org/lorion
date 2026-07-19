import { createDescriptorCatalog } from '@lorion-org/composition-graph';

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

console.log(selection.getResolved());
// ['checkout', 'payment-provider-invoice', 'payment-provider-stripe', 'payments', 'shops', 'web']

console.log(selection.getProvenance());
// [
//   { descriptorId: 'checkout', origins: ['resolved'] },
//   { descriptorId: 'payment-provider-invoice', origins: ['resolved'] },
//   { descriptorId: 'payment-provider-stripe', origins: ['resolved'] },
//   { descriptorId: 'payments', origins: ['resolved'] },
//   { descriptorId: 'shops', origins: ['resolved'] },
//   { descriptorId: 'web', origins: ['selected'] }
// ]
