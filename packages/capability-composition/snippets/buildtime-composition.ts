import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { resolveSelectedCapabilities } from '@lorion-org/capability-composition';
import { conventionActivation, resolveSurfaceModules } from '@lorion-org/surface-activation';

// Build-time composition: which capabilities are injected is decided and frozen
// at build time. The graph is resolved once, and `resolveSurfaceModules` maps each
// active capability to a *static* import specifier — a build step turns this into
// static imports, so the host bundles exactly this set with no runtime discovery
// and no dynamic `import(specifier)`. Swapping a provider or feature changes the
// seed and regenerates the set; it never moves the decision to runtime.

const workspaceRoot = dirname(fileURLToPath(import.meta.url));

function toCamelCase(id: string): string {
  return id.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
}

// The host owns the surface convention: a capability provides the `server`
// surface when it ships `src/server.mjs`; its export is
// `<camelCaseId>ServerCapability` from the `./server` subpath.
const activation = conventionActivation({
  server: {
    marker: (directory) => existsSync(join(directory, 'src/server.mjs')),
    exportName: (id) => `${toCamelCase(id)}ServerCapability`,
    exportSubpath: './server',
  },
});

// Resolve the graph at build time: platform base on (pulls the graph-only
// `tokens` dep), `auth` resolves its single default provider (auth-local), and
// `dashboard` is selected.
const active = resolveSelectedCapabilities({
  workspaceRoot,
  capabilitiesDir: 'capabilities',
  seed: { baseDescriptors: ['platform', 'auth'], selected: ['dashboard'] },
});

// The static injection manifest — the same seam the runtime loop uses, so a
// build-time host and a runtime host agree on exactly what gets wired.
const manifest = resolveSurfaceModules(active, 'server', activation).map((module) => ({
  id: module.capability.id,
  specifier: module.specifier,
  exportName: module.exportName,
}));

console.log(manifest);
// [
//   { id: 'auth-local', specifier: '@demo/auth-local/server', exportName: 'authLocalServerCapability' },
//   { id: 'dashboard',  specifier: '@demo/dashboard/server',  exportName: 'dashboardServerCapability' },
//   { id: 'platform',   specifier: '@demo/platform/server',   exportName: 'platformServerCapability' },
// ]
// A build step turns this list into static imports; the injected set is fixed at build time.
