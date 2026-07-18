import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CompositionPolicy, Descriptor, DescriptorId } from '@lorion-org/composition-graph';
import { descriptorSchema, discoverDescriptors } from '@lorion-org/descriptor-discovery';
import { selectDescriptors } from '@lorion-org/descriptor-selection';

// Capability composition: descriptor-defined capabilities that live as filesystem
// packages, composed into a host. This package owns disk discovery, surface-
// convention activation, and the runtime/build-time compose loop; resolving the
// active set (seed, dependencies, one provider per capability) is delegated to
// @lorion-org/descriptor-selection, so no selection logic is duplicated here.

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

export interface ResolvedCapability {
  id: string;
  directory: string;
  packageName: string;
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

export interface SurfaceActivation {
  exportSubpath: string;
  exportName: string;
}

export interface SurfaceConvention {
  // True when the capability provides this surface (a file-layout marker).
  marker: (directory: string) => boolean;
  // Derives the exported symbol name from the capability id.
  exportName: (id: string) => string;
  // The package export subpath the symbol is imported from (for example `./web`).
  exportSubpath: string;
}

export type ActivationResolver = (
  surface: string,
  capability: { directory: string; id: string },
) => SurfaceActivation | undefined;

// Builds an activation resolver from per-surface conventions. A host declares
// how a surface is detected (marker) and named (exportName); the descriptor
// carries no surface config.
export function conventionActivation(
  surfaces: Record<string, SurfaceConvention>,
): ActivationResolver {
  return (surface, capability) => {
    const convention = surfaces[surface];
    if (!convention || !convention.marker(capability.directory)) return undefined;
    return {
      exportSubpath: convention.exportSubpath,
      exportName: convention.exportName(capability.id),
    };
  };
}

export interface CapabilitySurfaceModule {
  capability: ResolvedCapability;
  specifier: string;
  exportName: string;
}

// For each active capability that provides the surface, the module specifier and
// export name to import. This is the seam shared by both host styles: the runtime
// loop (composeCapabilities) feeds each specifier to a dynamic `load`, while a
// build-time host code-generates static imports from the same list. One place
// owns the specifier and activation logic.
export function resolveSurfaceModules(
  active: readonly ResolvedCapability[],
  surface: string,
  activation: ActivationResolver,
): CapabilitySurfaceModule[] {
  return active.flatMap((capability) => {
    const entry = activation(surface, { directory: capability.directory, id: capability.id });
    if (!entry) return [];
    return [
      {
        capability,
        specifier: `${capability.packageName}${entry.exportSubpath.replace(/^\./, '')}`,
        exportName: entry.exportName,
      },
    ];
  });
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
