import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  describeComposition,
  formatCompositionReport,
  notResolved,
  resolveCapabilitySelection,
} from '@lorion-org/capability-composition';

// Reporting on a composition: one resolution, described once, rendered by the host.
// The report is derived from the very resolution that composes the app, so it
// cannot describe a different selection than the one that was built.

const workspaceRoot = dirname(fileURLToPath(import.meta.url));

// What this run asks for, kept as its own value so the injection point is visible:
// null means "no seed given, take the default selection".
const requestedSelection: string[] | null = ['storefront'];
const baseDescriptors = ['commerce'];
const defaultSelection = ['shop'];

const { capabilities, providerSelection, discovered } = resolveCapabilitySelection({
  workspaceRoot,
  seed: {
    baseDescriptors,
    defaultSelection,
    ...(requestedSelection ? { selected: requestedSelection } : {}),
  },
});

const report = describeComposition({
  requested: requestedSelection,
  selected: requestedSelection ?? defaultSelection,
  base: baseDescriptors,
  // Descriptor ids, not packages: a host that distinguishes the two filters here.
  resolved: capabilities.map((capability) => capability.id),
  discovered,
  providers: [...providerSelection.selections.values()],
});

for (const line of formatCompositionReport(report)) console.log(line);

// The same report answers "why is my capability not in the app".
if (notResolved(report).includes('admin')) console.log('admin is not part of this build');
