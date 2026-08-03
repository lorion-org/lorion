import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { lorionReact } from '@lorion-org/react/vite';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const routesDirectory = resolve(projectRoot, 'src/routes');
const generatedRouteTree = resolve(projectRoot, 'src/routeTree.gen.ts');
// The manifest declares the groupings; this host injects which of them is the
// always-on base and which is the default selection, because that is a property of
// this run and not of the grouping file.
const baseBundle = 'commerce';
const defaultBundle = 'storefront';

const lorion = lorionReact({
  workspaceRoot: projectRoot,
  routesDirectory,
  indexRouteFile: false,
  // Same capability graph and the same bundles.json as the react-loader example:
  // only the host model differs (Model A: LORION runtime + generated route config).
  // `bundles` discovers the manifest's groupings; this host names the seed: the
  // always-on base `commerce` is the checkout core (checkout -> payments + Stripe
  // default), the default selection `storefront` is the full shop. --features /
  // LORION_FEATURES replaces the selection, the `commerce` base stays on.
  bundles: { cwd: projectRoot },
  baseDescriptors: [baseBundle],
  defaultSelection: [defaultBundle],
});

export default defineConfig({
  root: projectRoot,
  server: {
    port: 3200,
  },
  resolve: {
    alias: {
      '@lorion-org/react': resolve(projectRoot, '../../packages/react/src/index.ts'),
    },
  },
  plugins: [
    lorion.capabilityLoader,
    tanstackRouter({
      target: 'react',
      generatedRouteTree,
      routesDirectory,
      virtualRouteConfig: lorion.routeConfig,
    }),
    react(),
  ],
});
