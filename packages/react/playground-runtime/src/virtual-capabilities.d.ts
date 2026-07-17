declare module 'virtual:capabilities' {
  import type { WebPlugin } from './plugin';

  // In Model B the pre-resolved module list carries the host's own plugin type,
  // not a LORION runtime type. Only activated (web-surface) capabilities appear
  // here; graph-only capabilities are absent but still listed in
  // `resolvedCapabilityIds`.
  export const capabilityModules: WebPlugin[];
  export const resolvedCapabilityIds: string[];
  export const selectedCapabilityIds: string[];
}
