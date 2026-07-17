import type { WebPlugin } from './plugin';

// A minimal host-owned registry. This stands in for whatever plugin system a
// product already has; LORION does not prescribe it.
export function createRegistry() {
  const plugins: WebPlugin[] = [];

  return {
    register(plugin: WebPlugin): void {
      plugins.push(plugin);
    },
    async setup(): Promise<void> {
      for (const plugin of plugins) {
        await plugin.setup?.();
      }
    },
    get plugins(): readonly WebPlugin[] {
      return plugins;
    },
  };
}
