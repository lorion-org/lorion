import { defineCapability } from '@lorion-org/react';
import { defineShops } from '../../shops/src';
import manifest from '../capability.json';

export const capability = defineCapability({
  id: 'shop-coffee',
  manifest,
  contributions: [
    defineShops([
      {
        id: 'shop-coffee',
        name: 'Bean Supply Plus',
        path: '/shops/coffee',
        slug: 'coffee',
        tagline: 'Coffee beans, brewing gear, and subscriptions.',
      },
    ]),
  ],
});
