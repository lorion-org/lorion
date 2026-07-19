import type { HostRuntime, RouteContribution, WebPlugin } from './plugin';

// The host's own runtime. It composes the pre-resolved capability plugins
// (emitted by the LORION loader as `virtual:capabilities`) into aggregated
// extension points — routes and typed contributions — with no LORION runtime
// involved. This stands in for whatever plugin/runtime system a real product
// already has.
export async function createHostRuntime(plugins: readonly WebPlugin[]): Promise<HostRuntime> {
  const routes: RouteContribution[] = [];
  const contributions = new Map<string, unknown[]>();

  for (const plugin of plugins) {
    await plugin.setup?.();
    for (const route of plugin.routes ?? []) routes.push(route);
    for (const [extensionPoint, items] of Object.entries(plugin.contributions ?? {})) {
      const bucket = contributions.get(extensionPoint) ?? [];
      bucket.push(...items);
      contributions.set(extensionPoint, bucket);
    }
  }

  return {
    routes,
    get<T>(extensionPoint: string): T[] {
      return (contributions.get(extensionPoint) ?? []) as T[];
    },
  };
}
