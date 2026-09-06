import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  conventionActivation,
  createCompositionRun,
  fileSurfaceConvention,
  formatCompositionOrigins,
  resolvePackageSources,
} from '@lorion-org/capability-composition';
import {
  assertKnownReferences,
  contributionRelationDescriptor,
  defaultRelationDescriptors,
  resolveContributions,
} from '@lorion-org/composition-graph';

// A workspace host from the package set up: the packages are resolved once, the run
// is stated once, and everything that acts on the composition or reports about it
// reads that one run. Two checkouts take part, which is what a product does when it
// composes its own packages with those of a core it consumes.

const workspaceRoot = dirname(fileURLToPath(import.meta.url));

// The package set: this workspace, plus a second checkout joined into it. Patterns
// are named here; a workspace whose manifest declares them needs no argument at all.
const { packageSources, descriptorPaths } = resolvePackageSources({
  root: workspaceRoot,
  patterns: ['capabilities/*'],
  additionalRoots: [{ root: 'external', patterns: ['capabilities/*'] }],
});

const activation = conventionActivation({
  server: fileSurfaceConvention({
    files: ['src/server.mjs'],
    exportSuffix: 'ServerCapability',
    exportSubpath: './server',
    exists: existsSync,
    join,
  }),
});

// One run. The report, the origins, the surface projection and the runtime
// composition below are projections of this one resolution, so none of them can
// describe a composition another one did not compose.
const run = createCompositionRun({
  workspaceRoot,
  descriptorPaths: [...descriptorPaths],
  packageSources,
  // The declared contribution edge, registered so the graph carries it. It is walked
  // for inspection, and what resolves stays what dependencies and providers resolve.
  relationDescriptors: [contributionRelationDescriptor()],
  virtualDescriptors: [
    {
      id: 'back-office',
      version: '0.0.0',
      dependencies: { dashboard: '^1.0.0', reports: '^1.0.0' },
    },
  ],
  seed: {
    baseDescriptors: ['platform', 'auth'],
    selected: ['back-office', 'audit-log'],
    selectionSeed: false,
  },
});

const descriptors = run.descriptors().map((entry) => entry.descriptor);

// A name no descriptor declares resolves to nothing at all: a dependency pulls in
// nothing and a contribution lands nowhere. Checked against every relation the run
// carries, so a typo is reported instead of quietly shrinking the composition.
assertKnownReferences({
  descriptors,
  relationDescriptors: [...defaultRelationDescriptors, contributionRelationDescriptor()],
});

const contributions = resolveContributions(descriptors);
console.log(contributions.receives('dashboard'));
// [
//   { from: 'reports', to: 'dashboard', point: 'panel' },
//   { from: 'audit-log', to: 'dashboard', point: 'panel' },
// ]

console.log(formatCompositionOrigins(run.origins()).join('\n'));
//   Named         audit-log
//   Base          platform
//   Groupings     back-office
//   auth          auth-local (not named by this run) (instead of auth-oidc)
//   Via groupings dashboard, reports
//   Pulled        tokens

console.log(run.surfaceEntries('server', activation).map((entry) => entry.specifier));
// [
//   '@demo/audit-log/server',
//   '@demo/auth-local/server',
//   '@demo/dashboard/server',
//   '@demo/platform/server',
//   '@demo/reports/server',
// ]

// The same run, loaded: the package set answers where each specifier lives, so a host
// spanning two checkouts needs no loader of its own.
const registry = new Map<string, unknown>();
await run.compose({
  surface: 'server',
  activation,
  register: (exportValue, capability) => {
    registry.set(capability.id, exportValue);
  },
});

console.log([...registry.keys()]);
// [ 'audit-log', 'auth-local', 'dashboard', 'platform', 'reports' ]
