import { defineWebPlugin } from '@acme/plugin';
import { ShopsPage } from './ShopsPage';

export const shopsWebPlugin = defineWebPlugin({
  id: 'shops',
  routes: [{ path: '/', nav: { label: 'Shops', order: 0 }, Component: ShopsPage }],
});
