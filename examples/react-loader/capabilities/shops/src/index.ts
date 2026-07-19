import { useContributions } from '@acme/plugin';

export type Shop = {
  id: string;
  name: string;
  path: string;
  slug: string;
  tagline: string;
};

// The host's shops extension point. Shop capabilities contribute an entry; the
// shops landing page reads them all back.
export const SHOP_EXTENSION = 'acme.shops';

export function useShops(): Shop[] {
  return useContributions<Shop>(SHOP_EXTENSION);
}
