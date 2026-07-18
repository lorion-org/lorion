// A minimal host-owned server registry — the stand-in for whatever plugin system
// a product already has. LORION only selects and composes capabilities; the shape
// of a "server capability" and how its routes are mounted is the host's decision.
export function createRegistry() {
  const capabilities = [];
  const routes = new Map();

  return {
    register(capability) {
      capabilities.push(capability);
    },
    setup() {
      for (const capability of capabilities) {
        for (const route of capability.routes ?? []) {
          routes.set(route.path, { capability: capability.id, ...route });
        }
      }
    },
    ids() {
      return capabilities.map((capability) => capability.id);
    },
    routes() {
      return [...routes.values()];
    },
    handle(path) {
      return routes.get(path) ?? null;
    },
  };
}
