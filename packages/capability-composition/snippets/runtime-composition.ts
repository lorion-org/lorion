import { existsSync } from 'node:fs';
import { join } from 'node:path';

import {
  composeCapabilities,
  conventionActivation,
  createWorkspaceLoad,
  fileSurfaceConvention,
  resolveWorkspaceRoot,
} from '@lorion-org/capability-composition';

// Runtime composition for a Node/Bun workspace host — the counterpart to
// `buildtime-composition.ts`. Instead of freezing a static import manifest, it
// resolves the graph at boot and loads each active capability's module dynamically:
//   - `resolveWorkspaceRoot` finds the monorepo root by walking up to the `packages`
//     directory (`import.meta.url` is the host's own module).
//   - `createWorkspaceLoad` supplies the `load` callback, importing each workspace
//     package from its declared `exports`, so the host writes no per-package loader.
// Together a workspace host needs no bespoke plumbing of its own.

const workspaceRoot = resolveWorkspaceRoot(import.meta.url);

// The host owns the surface convention: a capability provides the `server` surface
// when it ships `src/server.mjs`, exported as `<camelCaseId>ServerCapability` from
// the `./server` subpath. `fileSurfaceConvention` builds the marker/naming; the host
// injects only `exists`/`join`, keeping the convention package I/O-free.
const activation = conventionActivation({
  server: fileSurfaceConvention({
    files: ['src/server.mjs'],
    exportSuffix: 'ServerCapability',
    exportSubpath: './server',
    exists: existsSync,
    join,
  }),
});

// A tiny host registry the composition writes into.
const registry = new Map<string, unknown>();

// Capabilities live as workspace packages under `packages/`, so discovery and the
// loader agree on that one directory: `capabilitiesDir` for the descriptor scan and
// `packagesDir` (the `createWorkspaceLoad` default `'packages'`) for the import.
async function boot(): Promise<void> {
  await composeCapabilities({
    workspaceRoot,
    capabilitiesDir: 'packages',
    seed: { baseDescriptors: ['platform'], defaultSelection: ['dashboard'] },
    surface: 'server',
    activation,
    load: createWorkspaceLoad({ workspaceRoot }),
    register: (exportValue, capability) => {
      registry.set(capability.id, exportValue);
    },
  });

  console.log([...registry.keys()]);
}

void boot();
