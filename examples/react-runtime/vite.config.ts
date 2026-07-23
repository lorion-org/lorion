import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { lorionReact } from '@lorion-org/react/vite';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const routesDirectory = resolve(projectRoot, 'src/routes');
const generatedRouteTree = resolve(projectRoot, 'src/routeTree.gen.ts');
const lorion = lorionReact({
  workspaceRoot: projectRoot,
  routesDirectory,
  indexRouteFile: false,
  // Same capability graph and the same bundles.json as the react-loader example:
  // only the host model differs (Model A: LORION runtime + generated route config).
  // `bundles` discovers the manifest and seeds base/default: the always-on base
  // `commerce` is the checkout core (checkout -> payments + Stripe default), the
  // default `storefront` is the full shop. --features / LORION_FEATURES replaces the
  // selection (the `commerce` base stays on), --base / LORION_BASE swaps the base.
  bundles: { cwd: projectRoot },
  baseSeed: { cliKeys: ['base'], envKeys: ['LORION_BASE'] },
});

export default defineConfig({
  root: projectRoot,
  server: {
    port: 3200,
  },
  resolve: {
    alias: {
      '@lorion-org/provider-selection': resolve(
        projectRoot,
        '../../packages/provider-selection/src/index.ts',
      ),
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
