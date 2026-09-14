import { useContributions, type ContributionRuntime } from '@lorion-org/react/contributions';
import { point } from '../contributions';
import type { Shop } from '../contracts';
export type { Shop } from '../contracts';
export function getShops(runtime: ContributionRuntime): Shop[] {
  return runtime.get(point).map(({ value }) => value);
}
export function useShops(): Shop[] {
  return useContributions(point).map(({ value }) => value);
}
