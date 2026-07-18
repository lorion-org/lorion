import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { conventionActivation } from '../../dist/index.js';

// Shared composition config — identical for both host styles. Only *when* it runs
// and *how* the module is loaded differs between the runtime and build-time hosts.
const srcDir = dirname(fileURLToPath(import.meta.url));

export const workspaceRoot = join(srcDir, '..');
export const capabilitiesDir = 'capabilities';
export const surface = 'server';

function toCamelCase(id) {
  return id.replace(/-([a-z])/g, (_match, char) => char.toUpperCase());
}

// The host owns the surface convention: a `server` surface exists when the
// capability ships `src/server.mjs`; its export is `<camelCaseId>ServerCapability`
// from the `./server` subpath. The descriptor carries no surface config.
export const activation = conventionActivation({
  server: {
    marker: (directory) => existsSync(join(directory, 'src/server.mjs')),
    exportName: (id) => `${toCamelCase(id)}ServerCapability`,
    exportSubpath: './server',
  },
});

// Always-on base + a default feature; the auth provider resolves through the
// graph. Overridable via --features / LORION_FEATURES (for example
// `LORION_FEATURES="reports auth-oidc"` swaps the auth provider).
export const seed = {
  baseDescriptors: ['platform', 'auth'],
  defaultSelection: ['dashboard'],
  selectionSeed: { cliKeys: ['features'], envKeys: ['LORION_FEATURES'] },
};

// The runtime host resolves a composed specifier (`@demo-server/<id>/server`) to
// a module. A real server resolves it through node_modules; this playground maps
// it to the co-located source.
export function loadLocal(specifier) {
  const id = specifier.replace(/^@demo-server\//, '').replace(/\/server$/, '');
  return import(new URL(`../capabilities/${id}/src/server.mjs`, import.meta.url).href);
}
