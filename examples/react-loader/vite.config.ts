import { existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { conventionActivation, fileSurfaceConvention } from '@lorion-org/surface-activation';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { capabilityLoader } from '@lorion-org/react/vite';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const capabilitiesRoot = resolve(projectRoot, 'capabilities');

// Model B leaves specifier resolution to the host bundler. Map each capability
// web surface to its source, the same way a product host aliases its own
// workspace packages. Capabilities without a web surface need no alias.
const capabilityAliases = readdirSync(capabilitiesRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => ({
    find: `@acme/${entry.name}/web`,
    file: resolve(capabilitiesRoot, entry.name, 'src/web.ts'),
  }))
  .filter((entry) => existsSync(entry.file))
  .map((entry) => ({ find: entry.find, replacement: entry.file }));

// The surface convention, framework-free and shared across hosts: a web surface
// exists when the capability ships `src/web.ts`, and its export is
// `<camelCaseId>WebPlugin` from the `./web` subpath. `fileSurfaceConvention` builds
// the marker/naming; the host injects only `exists`, keeping the convention package
// I/O-free. The descriptor carries no surface config — this is the same
// `conventionActivation` a runtime host (a Bun server) would pass to
// `composeCapabilities`, here handed to the build-time loader instead.
const activation = conventionActivation({
  web: fileSurfaceConvention({
    files: ['src/web.ts'],
    exportSuffix: 'WebPlugin',
    exportSubpath: './web',
    exists: existsSync,
    join,
  }),
});

export default defineConfig({
  root: projectRoot,
  server: {
    port: 3201,
  },
  resolve: {
    alias: [
      { find: '@acme/plugin', replacement: resolve(projectRoot, 'src/plugin.ts') },
      ...capabilityAliases,
    ],
  },
  plugins: [
    // Model B (loader-only): @lorion-org/react resolves the descriptor graph at
    // build time and emits `virtual:capabilities`. This example owns the runtime
    // and router (see src/main.tsx).
    //
    // Two grouping styles compose here at once, over the shop-with-payment graph:
    //   - `bundles: { cwd }` discovers bundles.json (walking up), expands it into
    //     virtual descriptors and fills the base/default seed. The always-on base
    //     `commerce` is the checkout core (checkout -> payments + the Stripe default
    //     provider); the default selection `storefront` is the full shop.
    //   - `storefront` depends on the `web` grouping *capability* (a package-per-
    //     group descriptor on disk) — so the manifest-bundle model and the
    //     package-group model resolve together. `web` adds the transitive deps
    //     (shops, coffee, stationery, checkout, payments).
    //
    // Overridable without touching the config: --features / LORION_FEATURES replaces
    // the selection (e.g. `admin`, or `payment-provider-invoice` to swap the
    // provider) — the `commerce` base stays on regardless. --base / LORION_BASE
    // swaps the base bundle.
    capabilityLoader({
      workspaceRoot: projectRoot,
      bundles: { cwd: projectRoot },
      selectionSeed: { cliKeys: ['features'], envKeys: ['LORION_FEATURES'] },
      baseSeed: { cliKeys: ['base'], envKeys: ['LORION_BASE'] },
      surface: { name: 'web', resolver: activation },
    }),
    react(),
  ],
});
