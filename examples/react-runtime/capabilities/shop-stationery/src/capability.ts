import { defineCapability } from '@lorion-org/react';
import { defineShops } from '../../shops/src';
import manifest from '../capability.json';

export const capability = defineCapability({
  id: 'shop-stationery',
  manifest,
  contributions: [
    defineShops([
      {
        id: 'shop-stationery',
        name: 'Paper Desk',
        path: '/shops/stationery',
        slug: 'stationery',
        tagline: 'Notebooks, pens, and desk basics.',
      },
    ]),
  ],
});
