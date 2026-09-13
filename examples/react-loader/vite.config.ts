import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createWorkspaceCompositionRun,
  formatCompositionReport,
} from '@lorion-org/capability-composition';
import {
  assertKnownReferences,
  contributionRelationDescriptor,
  defaultRelationDescriptors,
} from '@lorion-org/composition-graph';
import { resolvePackageEntries } from '@lorion-org/descriptor-discovery';
import { conventionActivation, fileSurfaceConvention } from '@lorion-org/surface-activation';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { capabilityLoader } from '@lorion-org/react/vite';

const projectRoot = dirname(fileURLToPath(import.meta.url));

// The manifest declares the groupings; this host names which of them is the
// always-on base and which is the default selection, because that is a property of
// this run and not of the grouping file. The always-on base `commerce` is the
// checkout core (checkout -> payments + the Stripe default provider); the default
// selection `storefront` is the full shop, which reaches the `web` grouping
// capability on disk and through it the shops, the checkout and the receipts
// capability of the second checkout.
//
// Overridable without touching this config: --features / LORION_FEATURES replaces
// the selection (e.g. `admin`, or `payment-provider-invoice` to swap the provider) —
// the `commerce` base stays on regardless.
// The package set this host composes: the capabilities of this example, plus those
// of a second checkout joined into the same set. Patterns are named here because
// this example is not itself a workspace root; a workspace whose manifest declares
// them passes nothing at all.
const run = createWorkspaceCompositionRun({
  root: projectRoot,
  patterns: ['capabilities/*', 'prototypes/*'],
  additionalRoots: [{ root: 'external', patterns: ['capabilities/*'] }],
  bundles: { cwd: projectRoot },
  seed: {
    baseDescriptors: ['commerce', 'product-theme'],
    defaultSelection: ['storefront'],
    selectionSeed: { cliKeys: ['features'], envKeys: ['LORION_FEATURES'] },
  },
  // The declared contribution relation: a capability owner offers named points and
  // guests declare which of them they fill. Registered so the graph carries the
  // edge; it is walked for inspection and changes nothing about what resolves.
  relationDescriptors: [contributionRelationDescriptor()],
});

// Model B leaves specifier resolution to the host bundler. Each public entry a
// capability declares is mapped to its source file, which is what a product host
// does for its own workspace packages. The entries come from the manifests, so a
// capability that declares no such export contributes no alias, and a capability in
// the second checkout is aliased like any other.
const capabilityAliases = resolvePackageEntries(run.selectedPackageSources(), ['.', './web']).map(
  (entry) => ({
    find: new RegExp(`^${entry.specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`),
    replacement: entry.entryPath,
  }),
);

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

// What the emitted module contains, and why. Workspace discovery, selection,
// reporting, contribution projection, aliases and the loader all read this run.
const descriptors = run.descriptors().map((entry) => entry.descriptor);

// A name no descriptor declares resolves to nothing at all, in either relation.
assertKnownReferences({
  descriptors,
  relationDescriptors: [...defaultRelationDescriptors, contributionRelationDescriptor()],
});

const contributions = run.contributions();
console.log(
  [
    '',
    'Composed capabilities:',
    ...formatCompositionReport(run.report()),
    '',
    '  Contributions:',
    ...contributions.edges.map((edge) => `    ${edge.from} -> ${edge.to} (${edge.point})`),
    '',
  ].join('\n'),
);

export default defineConfig({
  root: projectRoot,
  server: {
    port: 3201,
  },
  resolve: {
    alias: [
      { find: '@acme/plugin', replacement: join(projectRoot, 'src/plugin.ts') },
      ...capabilityAliases,
    ],
  },
  plugins: [
    // Model B (loader-only): @lorion-org/react emits `virtual:capabilities` from
    // the run resolved above. This example owns the runtime and router (see
    // src/main.tsx).
    //
    // Two grouping styles compose here at once, over the shop-with-payment graph:
    // the manifest bundles from `bundles.json`, and the `web` grouping capability,
    // which is an ordinary package-per-group descriptor on disk.
    capabilityLoader({
      run,
      surface: { name: 'web', resolver: activation },
    }),
    react(),
  ],
});
