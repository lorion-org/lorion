import { createRouter as createTanStackRouter } from '@tanstack/react-router';
import { createCapabilityRuntime, type CapabilityRuntime } from '@lorion-org/react';
import { capabilityModules } from 'virtual:capabilities';
import { routeTree } from './routeTree.gen';

export type RouterContext = {
  capabilityRuntime: CapabilityRuntime;
};

export const capabilityRuntime = createCapabilityRuntime(capabilityModules);

export function createRouter() {
  return createTanStackRouter({
    routeTree,
    context: {
      capabilityRuntime,
    },
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>;
  }
}
