import { existsSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { capabilityLoader } from '../src/vite';

const playgroundRoot = dirname(fileURLToPath(import.meta.url));
const capabilitiesRoot = resolve(playgroundRoot, 'capabilities');

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
    // Only the capability loader is used. The host owns the runtime, routing,
    // and lifecycle; LORION resolves the graph and emits `virtual:capabilities`.
    capabilityLoader({
      workspaceRoot: playgroundRoot,
      baseDescriptors: ['platform', 'auth'],
      defaultSelection: ['dashboard'],
      selectionSeed: { cliKeys: ['features'], envKeys: ['LORION_FEATURES'] },
      // Explicit activation: read the host-defined `surfaces.web` field.
      // Packages without a web surface (tokens, the auth slot) return undefined
      // and stay graph-only.
      activation: ({ descriptor }) => {
        const surfaces = (
          descriptor as {
            surfaces?: Record<string, { exportName: string; exportSubpath: string }>;
          }
        ).surfaces;
        return surfaces?.web;
      },
    }),
    react(),
  ],
});
