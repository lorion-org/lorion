import { createRegistry } from '@lorion-org/registry-hub';
import process from 'node:process';

const shops = createRegistry('shops');

shops.register([
  { id: 'shop-coffee', name: 'Bean Supply', path: '/shops/coffee' },
  { id: 'shop-stationery', name: 'Paper Desk', path: '/shops/stationery' },
]);

process.stdout.write(
  `${shops.id}:${shops
    .entries()
    .map(([id]) => id)
    .join(',')}\n`,
);
