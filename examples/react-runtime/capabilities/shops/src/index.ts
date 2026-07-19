import {
  createContributionContract,
  type CapabilityContribution,
  type CapabilityRuntime,
} from '@lorion-org/react';

export type Shop = {
  id: string;
  name: string;
  path: string;
  slug: string;
  tagline: string;
};

export const SHOP_CONTRACT = createContributionContract<Shop>('acme.shops');
export const SHOP_EXTENSION = SHOP_CONTRACT.extensionPoint;

export function defineShops(shops: readonly Shop[]): CapabilityContribution<Shop> {
  return SHOP_CONTRACT.define(shops);
}

export function getShops(runtime: CapabilityRuntime): Shop[] {
  return SHOP_CONTRACT.get(runtime);
}

export function useShops(): Shop[] {
  return SHOP_CONTRACT.use();
}
