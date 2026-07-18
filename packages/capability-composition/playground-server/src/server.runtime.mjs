import { composeCapabilities } from '../../dist/index.js';

import {
  activation,
  capabilitiesDir,
  loadLocal,
  seed,
  surface,
  workspaceRoot,
} from './composition.mjs';
import { createRegistry } from './registry.mjs';

// Runtime host. It composes at boot — discover, select, dynamic-import, register —
// with no build step. For a source-run server that starts once, this is a fine,
// simple default; the resolution is a one-time, deterministic boot cost.
const registry = createRegistry();

await composeCapabilities({
  workspaceRoot,
  capabilitiesDir,
  seed,
  surface,
  activation,
  load: loadLocal,
  register: (value) => registry.register(value),
});
registry.setup();

console.log('[runtime] injected:', registry.ids());
for (const route of registry.routes()) {
  console.log(`  ${route.path}  (${route.capability}) — ${route.summary}`);
}
