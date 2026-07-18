import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conventionActivation } from '@lorion-org/capability-composition';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { capabilityLoader } from '../src/vite';

const playgroundRoot = dirname(fileURLToPath(import.meta.url));
const capabilitiesRoot = resolve(playgroundRoot, 'capabilities');

function toCamelCase(id: string): string {
  return id.replace(/-([a-z])/g, (_match, char: string) => char.toUpperCase());
}

// Model B leaves specifier resolution to the host bundler. Map each capability
// web surface to its source, the same way a product host aliases its own
// workspace packages. Capabilities without a web surface need no alias.
const capabilityAliases = readdirSync(capabilitiesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    find: `@runtime-demo/${entry.name}/web`,
    file: resolve(capabilitiesRoot, entry.name, 'src/web.ts'),
  }))
  .filter((entry) => existsSync(entry.file))
  .map((entry) => ({ find: entry.find, replacement: entry.file }));

// The surface convention, framework-free and shared across hosts: a web surface
// exists when the capability ships `src/web.ts`, and its export is
// `<camelCaseId>WebPlugin` from the `./web` subpath. The descriptor carries no
// surface config — this is the same `conventionActivation` a runtime host (a Bun
// server) would pass to `composeCapabilities`, here handed to the build-time
// loader instead.
const activation = conventionActivation({
  web: {
    marker: (directory) => existsSync(join(directory, 'src/web.ts')),
    exportName: (id) => `${toCamelCase(id)}WebPlugin`,
    exportSubpath: './web',
  },
});

export default defineConfig({
  root: playgroundRoot,
  server: {
    port: 3201,
  },
  resolve: {
    alias: [
      { find: '@runtime-demo/plugin', replacement: resolve(playgroundRoot, 'src/plugin.ts') },
      ...capabilityAliases,
    ],
  },
  plugins: [
    // Model B (loader-only): @lorion-org/react resolves the descriptor graph at
    // build time — base platform on, `dashboard` selected by default, the graph
    // adds transitive deps and the single auth provider — and emits
    // `virtual:capabilities`. This playground owns the runtime (see
    // src/registry.ts). Overridable via --features / LORION_FEATURES.
    capabilityLoader({
      workspaceRoot: playgroundRoot,
      baseDescriptors: ['platform', 'auth'],
      defaultSelection: ['dashboard'],
      selectionSeed: { cliKeys: ['features'], envKeys: ['LORION_FEATURES'] },
      activation: ({ capabilityDir, descriptor }) =>
        activation('web', { directory: capabilityDir, id: descriptor.id }),
    }),
    react(),
  ],
});
