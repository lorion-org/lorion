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
  defaultSelection: ['default'],
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
