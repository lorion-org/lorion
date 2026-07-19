import { createContext, useContext, type ReactNode } from 'react';

// The host product's OWN plugin contract. LORION does not prescribe this — it only
// selects and activates capabilities at build time. How a capability plugs into
// the running app (routes, extension points, the runtime that reads them) is the
// host's decision. A capability's web surface (`src/web.ts`, exported as
// `<camelCaseId>WebPlugin`) returns one of these.

export type NavEntry = { label: string; order?: number };

export type RouteContribution = {
  path: string;
  nav?: NavEntry;
  Component: () => ReactNode;
};

export type WebPlugin = {
  id: string;
  // Pages this capability adds to the host router.
  routes?: readonly RouteContribution[];
  // Typed entries this capability adds to named extension points; other
  // capabilities read them back through `useContributions`.
  contributions?: Readonly<Record<string, readonly unknown[]>>;
  setup?: () => void | Promise<void>;
};

export function defineWebPlugin(plugin: WebPlugin): WebPlugin {
  return plugin;
}

// The host runtime a capability sees at render time: the aggregated extension
// points. The host builds it (see registry.ts) and provides it through context.
export type HostRuntime = {
  routes: readonly RouteContribution[];
  get<T>(extensionPoint: string): T[];
};

const HostRuntimeContext = createContext<HostRuntime | null>(null);
export const HostRuntimeProvider = HostRuntimeContext.Provider;

export function useHostRuntime(): HostRuntime {
  const runtime = useContext(HostRuntimeContext);
  if (!runtime) throw new Error('HostRuntimeProvider is missing');
  return runtime;
}

export function useContributions<T>(extensionPoint: string): T[] {
  return useHostRuntime().get<T>(extensionPoint);
}
