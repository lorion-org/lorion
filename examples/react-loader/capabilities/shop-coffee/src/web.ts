import { defineWebPlugin } from '@acme/plugin';
import { SHOP_EXTENSION, type Shop } from '../../shops/src';
import { CoffeeShopPage } from './CoffeeShopPage';

const shop: Shop = {
  id: 'shop-coffee',
  name: 'Bean Supply',
  path: '/shops/coffee',
  slug: 'coffee',
  tagline: 'Coffee beans and simple brewing gear.',
};

export const shopCoffeeWebPlugin = defineWebPlugin({
  id: 'shop-coffee',
  routes: [{ path: '/shops/coffee', Component: CoffeeShopPage }],
  contributions: { [SHOP_EXTENSION]: [shop] },
});
