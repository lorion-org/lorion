import { defineWebPlugin } from '@acme/plugin';
import { SHOP_EXTENSION, type Shop } from '../../shops/src';
import { StationeryShopPage } from './StationeryShopPage';

const shop: Shop = {
  id: 'shop-stationery',
  name: 'Paper Desk',
  path: '/shops/stationery',
  slug: 'stationery',
  tagline: 'Notebooks, pens, and desk basics.',
};

export const shopStationeryWebPlugin = defineWebPlugin({
  id: 'shop-stationery',
  routes: [{ path: '/shops/stationery', Component: StationeryShopPage }],
  contributions: { [SHOP_EXTENSION]: [shop] },
});
