import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CompositionPolicy, Descriptor, DescriptorId } from '@lorion-org/composition-graph';
import { descriptorSchema, discoverDescriptors } from '@lorion-org/descriptor-discovery';
import { selectDescriptors } from '@lorion-org/descriptor-selection';
import {
  type ActivationResolver,
  resolveSurfaceModules,
  type SurfaceCapability,
} from '@lorion-org/surface-activation';

// Capability composition: descriptor-defined capabilities that live as filesystem
// packages, composed into a host. This package owns disk discovery and the
// runtime/build-time compose loop; resolving the active set (seed, dependencies,
// one provider per capability) is delegated to @lorion-org/descriptor-selection and
// the surface-addressing convention to @lorion-org/surface-activation, so no logic
// is duplicated here.

// Re-export only `conventionActivation` (and the types describing it) — the
// companion a `composeCapabilities` caller needs to build the activation it passes
// in. The build-time addressing tools (`resolveSurfaceModules`,
// `capabilitySpecifier`) stay owned solely by @lorion-org/surface-activation, so a
// build-time host depends on that light package directly instead of pulling in
// this runtime host.
export { conventionActivation } from '@lorion-org/surface-activation';
export type {
  ActivationResolver,
  SurfaceActivation,
  SurfaceConvention,
} from '@lorion-org/surface-activation';

export interface CapabilitySelectionSeed {
  baseDescriptors?: readonly DescriptorId[];
  defaultSelection?: readonly DescriptorId[];
  selected?: readonly DescriptorId[];
  selectionSeed?:
    | false
    | {
        argv?: string[];
        cliKeys?: string[];
        env?: Record<string, string | undefined>;
        envKeys?: string[];
      };
}

export interface ResolvedCapability extends SurfaceCapability {
  descriptor: Descriptor;
}

function readPackageName(directory: string): string {
  const path = resolve(directory, 'package.json');
  const json = JSON.parse(readFileSync(path, 'utf8')) as { name?: unknown };
  if (typeof json.name !== 'string') {
    throw new Error(`Capability package is missing "name": ${path}`);
  }
  return json.name;
}

// Resolves the active capability set: base + seed + transitive dependencies +
// exactly one provider per capability, over capabilities discovered on disk.
// The selection itself is owned by @lorion-org/descriptor-selection.
export function resolveSelectedCapabilities(options: {
  workspaceRoot: string;
  capabilitiesDir?: string;
  seed: CapabilitySelectionSeed;
  policy?: Partial<CompositionPolicy>;
}): ResolvedCapability[] {
  const capabilitiesDir = options.capabilitiesDir ?? 'capabilities';
  const items = discoverDescriptors({
    cwd: options.workspaceRoot,
    descriptorPaths: [`${capabilitiesDir}/*/capability.json`],
    validation: { schema: descriptorSchema },
  }).map((entry) => ({
    id: entry.descriptor.id,
    directory: entry.cwd,
    descriptor: entry.descriptor,
  }));

  const selected = selectDescriptors({
    items,
    getDescriptor: (item) => item.descriptor,
    withDescriptor: (item, descriptor) => ({ ...item, descriptor }),
    seed: options.seed,
    ...(options.policy ? { policy: options.policy } : {}),
  });

  // Read package.json only for the resolved set: an unrelated broken or nameless
  // package.json must not abort a composition that never imports that capability.
  return selected.map((item) => ({ ...item, packageName: readPackageName(item.directory) }));
}

// Runtime composition: resolve the active set, and for each capability that
// provides the requested surface, load its module and hand the exported value to
// the host's registration. Registry- and framework-agnostic. A build-time host
// uses `resolveSurfaceModules` directly to emit static imports instead.
export async function composeCapabilities(options: {
  workspaceRoot: string;
  capabilitiesDir?: string;
  seed: CapabilitySelectionSeed;
  surface: string;
  activation: ActivationResolver;
  load: (specifier: string) => Promise<Record<string, unknown>>;
  register: (exportValue: unknown, capability: ResolvedCapability) => void | Promise<void>;
}): Promise<ResolvedCapability[]> {
  const active = resolveSelectedCapabilities({
    workspaceRoot: options.workspaceRoot,
    capabilitiesDir: options.capabilitiesDir ?? 'capabilities',
    seed: options.seed,
  });
  const activated: ResolvedCapability[] = [];

  for (const { capability, specifier, exportName } of resolveSurfaceModules(
    active,
    options.surface,
    options.activation,
  )) {
    const module = await options.load(specifier);
    const exportValue = module[exportName];
    if (exportValue === undefined) continue;
    await options.register(exportValue, capability);
    activated.push(capability);
  }

  return activated;
}
