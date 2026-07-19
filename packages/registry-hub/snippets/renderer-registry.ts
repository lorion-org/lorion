import { createRegistry, type RegistryItem } from '@lorion-org/registry-hub';

type Shop = RegistryItem & {
  name: string;
  path: string;
};

const shops = createRegistry<Shop>('shops');

shops.register([
  { id: 'shop-coffee', name: 'Bean Supply', path: '/shops/coffee' },
  { id: 'shop-stationery', name: 'Paper Desk', path: '/shops/stationery' },
]);

console.log(shops.entries());
// [
//   ['shop-coffee', { id: 'shop-coffee', name: 'Bean Supply', path: '/shops/coffee' }],
//   ['shop-stationery', { id: 'shop-stationery', name: 'Paper Desk', path: '/shops/stationery' }]
// ]
