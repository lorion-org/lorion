import { composeCapabilities } from '../../dist/index.js';

import { generate } from './build.mjs';
import {
  activation,
  capabilitiesDir,
  loadLocal,
  seed,
  surface,
  workspaceRoot,
} from './composition.mjs';
import { createRegistry } from './registry.mjs';

// Proof: the two host styles compose the *identical* set from one shared brain —
// only the moment (build vs boot) and the load mechanism (static vs dynamic)
// differ. Run under a default seed and again with an overriding one.

// Build-time path: generate the static manifest, then import it.
generate();
const generated = await import('./capabilities.generated.mjs');
const buildRegistry = createRegistry();
for (const capability of generated.serverCapabilities) buildRegistry.register(capability);
buildRegistry.setup();

// Runtime path: compose at boot with dynamic import.
const runtimeRegistry = createRegistry();
await composeCapabilities({
  workspaceRoot,
  capabilitiesDir,
  seed,
  surface,
  activation,
  load: loadLocal,
  register: (value) => runtimeRegistry.register(value),
});
runtimeRegistry.setup();

const buildIds = buildRegistry.ids().sort();
const runtimeIds = runtimeRegistry.ids().sort();
const match = JSON.stringify(buildIds) === JSON.stringify(runtimeIds);

console.log('build-time :', buildIds);
console.log('runtime    :', runtimeIds);
console.log(
  match ? 'OK — both host styles compose the identical set' : 'FAIL — the two paths disagree',
);
process.exitCode = match ? 0 : 1;
