declare module 'virtual:capabilities' {
  import type { RuntimeCapability } from '@lorion-org/react';

  export const capabilityModules: RuntimeCapability[];
  export const resolvedCapabilityIds: string[];
  export const selectedCapabilityIds: string[];
}
