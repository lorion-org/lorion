import { injectedIds, serverCapabilities } from './capabilities.generated.mjs';
import { createRegistry } from './registry.mjs';

// Build-time host. It imports the generated set with a plain *static* import — the
// runtime sees exactly which capabilities are wired, with no filesystem discovery
// and no `import(specifier)`. Run `build.mjs` first to (re)generate the set.
const registry = createRegistry();
for (const capability of serverCapabilities) registry.register(capability);
registry.setup();

console.log('[build-time] injected:', injectedIds);
for (const route of registry.routes()) {
  console.log(`  ${route.path}  (${route.capability}) — ${route.summary}`);
}
