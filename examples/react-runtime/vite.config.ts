import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { lorionReact } from '@lorion-org/react/vite';
import versionPolicy from './version-policy.json';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const routesDirectory = resolve(projectRoot, 'src/routes');
const generatedRouteTree = resolve(projectRoot, 'src/routeTree.gen.ts');
// The manifest declares the groupings; this host injects which of them is the
// always-on base and which is the default selection, because that is a property of
// this run and not of the grouping file.
const baseBundle = 'commerce';
const optionalProviderSlot = 'product-theme';
const defaultBundle = 'storefront';

const lorion = lorionReact({
  workspaceRoot: projectRoot,
  versionSelectors: {
    beta: ({ prerelease }) => prerelease[0] === 'beta',
    next: ({ prerelease }) => prerelease[0] === 'beta',
    curated: ({ id, version }) =>
      versionPolicy.curated.some(
        (candidate) => candidate.id === id && candidate.version === version,
      ),
  },
  contributions: true,
  runtimeConfig: { source: { paths: ['tests/runtime-config/*/capability.runtime.json'] } },
  descriptorPaths: [
    'capabilities/*/capability.json',
    'prototypes/*/capability.json',
    ...(process.env.LORION_EXAMPLE_PROFILE?.startsWith('failure-')
      ? ['tests/failures/*/capability.json']
      : []),
  ],
  routesDirectory,
  indexRouteFile: false,
  // Same capability graph and the same bundles.json as the react-loader example:
  // only the host model differs (Model A: LORION runtime + generated route config).
  // `bundles` discovers the manifest's groupings; this host names the seed: the
  // always-on base `commerce` is the checkout core (checkout -> payments + Stripe
  // default), the default selection `storefront` is the full shop. --features /
  // LORION_FEATURES replaces the selection, the `commerce` base stays on.
  bundles: { cwd: projectRoot },
  baseDescriptors: ['inactive', 'provider-only'].includes(process.env.LORION_EXAMPLE_PROFILE ?? '')
    ? [optionalProviderSlot]
    : [baseBundle, optionalProviderSlot],
  defaultSelection: [defaultBundle, 'shop-coffee'],
  selectionSeed: { cliKeys: ['features'], envKeys: ['LORION_FEATURES'] },
});

export default defineConfig({
  root: projectRoot,
  server: {
    port: 3200,
  },
  build: {
    rollupOptions: {
      input:
        process.env.LORION_EXAMPLE_PROFILE === 'actions'
          ? {
              app: resolve(projectRoot, 'index.html'),
              isolation: resolve(projectRoot, 'isolation.html'),
            }
          : resolve(projectRoot, 'index.html'),
    },
  },
  plugins: [
    {
      name: 'contribution-acceptance-boundaries',
      generateBundle(_options, bundle) {
        if (!process.env.LORION_EXAMPLE_PROFILE) return;
        const profile = process.env.LORION_EXAMPLE_PROFILE;
        const chunks = Object.values(bundle).filter((entry) => entry.type === 'chunk');
        const modules = chunks
          .flatMap((chunk) => Object.keys(chunk.modules))
          .map((id) => id.replaceAll('\\', '/'));
        const code = chunks.map((chunk) => chunk.code).join('\n');
        if (code.includes('LORION_PRIVATE_CONFIG_PROBE'))
          throw new Error('Private configuration entered an application bundle.');
        const coffeeImplementations = [
          '/capabilities/shop-coffee/',
          '/prototypes/shop-coffee/',
          '/capabilities/shop-coffee-beta-v2/',
          '/capabilities/shop-coffee-beta-v3/',
        ];
        const selectedCoffee =
          profile.startsWith('legacy') || profile === 'curated-compatible'
            ? '/prototypes/shop-coffee/'
            : profile === 'beta-compatible' || profile === 'curated'
              ? '/capabilities/shop-coffee-beta-v2/'
              : profile.startsWith('beta')
                ? '/capabilities/shop-coffee-beta-v3/'
                : '/capabilities/shop-coffee/';
        const forbidden =
          profile === 'inactive'
            ? [
                '/capabilities/checkout/',
                '/capabilities/payments/',
                '/capabilities/shops/',
                ...coffeeImplementations,
              ]
            : coffeeImplementations.filter((path) => path !== selectedCoffee);
        for (const fragment of forbidden)
          if (modules.some((id) => id.includes(fragment)))
            throw new Error(`Unselected implementation entered an application bundle: ${fragment}`);
      },
    },
    lorion.capabilityLoader,
    tanstackRouter({
      target: 'react',
      generatedRouteTree,
      routesDirectory,
      virtualRouteConfig: {
        ...lorion.routeConfig,
        children: [
          ...(lorion.routeConfig.children ?? []),
          { type: 'route', path: '/tech', file: 'tech.tsx' },
        ],
      },
    }),
    react(),
  ],
});
