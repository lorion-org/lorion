import type { Descriptor, DescriptorId, DescriptorMap } from './types';

export function buildDescriptorMap(descriptors: Iterable<Descriptor>): DescriptorMap {
  const descriptorMap: DescriptorMap = new Map();

  for (const descriptor of descriptors) {
    descriptorMap.set(descriptor.id, descriptor);
  }

  return descriptorMap;
}

export function parseDescriptorIds(input?: DescriptorId[] | string): DescriptorId[] {
  if (!input) return [];

  const items = Array.isArray(input) ? input : input.split(/[,\s]+/).map((item) => item.trim());

  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).sort();
}

export function assertKnownDescriptorIds(
  descriptorMap: DescriptorMap,
  ids: DescriptorId[],
  label: string,
): void {
  const missing: DescriptorId[] = [...new Set(ids)]
    .filter((id) => id && !descriptorMap.has(id))
    .sort();

  if (!missing.length) return;

  throw new Error(`Unknown ${label}: ${missing.join(', ')}`);
}
