import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CompositionPolicy, Descriptor, DescriptorId } from '@lorion-org/composition-graph';
import {
  descriptorSchema,
  discoverDescriptors,
  loadBundleManifest,
  requirePackageName,
  virtualDescriptorDirectory,
} from '@lorion-org/descriptor-discovery';
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

// Re-export the convention-building companions a `composeCapabilities` caller needs
// to build the activation it passes in: `conventionActivation`, the
// `fileSurfaceConvention` preset, and the describing types. The build-time
// addressing tools (`resolveSurfaceModules`, `capabilitySpecifier`) stay owned
// solely by @lorion-org/surface-activation, so a build-time host depends on that
// light package directly instead of pulling in this runtime host.
export { conventionActivation, fileSurfaceConvention } from '@lorion-org/surface-activation';
// Re-export the bundle-manifest loader so a runtime host that needs the resolved
// descriptors/seed directly (not just the `bundles` convenience) has one import.
export { loadBundleManifest, type BundleManifest } from '@lorion-org/descriptor-discovery';
export type {
  ActivationResolver,
  FileSurfaceConventionOptions,
  SurfaceActivation,
  SurfaceConvention,
} from '@lorion-org/surface-activation';

export interface CapabilitySelectionSeed {
  baseDescriptors?: readonly DescriptorId[];
  // CLI/env override for the base descriptors, symmetric to `selectionSeed`: a
  // non-empty parse replaces `baseDescriptors`, otherwise `baseDescriptors` stands.
  baseSeed?:
    | false
    | {
        argv?: string[];
        cliKeys?: string[];
        env?: Record<string, string | undefined>;
        envKeys?: string[];
      };
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
  return requirePackageName(json, path);
}

// Resolves the active capability set: base + seed + transitive dependencies +
// exactly one provider per capability, over capabilities discovered on disk.
// The selection itself is owned by @lorion-org/descriptor-selection.
//
// `virtualDescriptors` are host-provided descriptors that join the discovered set
// for graph resolution without living on disk as packages: grouping descriptors
// (bundles) whose `dependencies` point at real capabilities. They take part in the
// selection graph but carry no surface, so they are never imported and need no
// `package.json`. This is the second, filesystem-free way to feed the composition,
// alongside disk discovery.
//
// `bundles` is the batteries-included path: point it at a directory and lorion
// discovers a bundle manifest upward, expands it into virtual descriptors and fills
// the base/default seed. Explicit `virtualDescriptors` and seed values still win.
export function resolveSelectedCapabilities(options: {
  workspaceRoot: string;
  capabilitiesDir?: string;
  virtualDescriptors?: readonly Descriptor[];
  bundles?: { cwd: string; fileName?: string };
  seed: CapabilitySelectionSeed;
  policy?: Partial<CompositionPolicy>;
}): ResolvedCapability[] {
  const capabilitiesDir = options.capabilitiesDir ?? 'capabilities';
  const manifest = options.bundles ? loadBundleManifest(options.bundles) : undefined;
  const virtualDescriptors = [
    ...(options.virtualDescriptors ?? []),
    ...(manifest?.virtualDescriptors ?? []),
  ];
  const seed: CapabilitySelectionSeed = manifest
    ? {
        ...options.seed,
        baseDescriptors: options.seed.baseDescriptors ?? manifest.baseDescriptors,
        defaultSelection: options.seed.defaultSelection ?? manifest.defaultSelection,
      }
    : options.seed;
  const discovered = discoverDescriptors({
    cwd: options.workspaceRoot,
    descriptorPaths: [`${capabilitiesDir}/*/capability.json`],
    validation: { schema: descriptorSchema },
  }).map((entry) => ({
    id: entry.descriptor.id,
    directory: entry.cwd,
    descriptor: entry.descriptor,
    virtual: false,
  }));

  // Virtual descriptors get a synthetic, non-existent directory so the surface
  // marker never matches (they activate nothing) and readPackageName is skipped.
  const virtual = virtualDescriptors.map((descriptor) => ({
    id: descriptor.id,
    directory: virtualDescriptorDirectory(options.workspaceRoot, descriptor.id),
    descriptor,
    virtual: true,
  }));

  const selected = selectDescriptors({
    items: [...discovered, ...virtual],
    getDescriptor: (item) => item.descriptor,
    withDescriptor: (item, descriptor) => ({ ...item, descriptor }),
    seed,
    ...(options.policy ? { policy: options.policy } : {}),
  });

  // Read package.json only for real, discovered capabilities: virtual grouping
  // descriptors have no package on disk and never resolve a surface. (Reading it
  // lazily here also keeps an unrelated broken package.json from aborting a
  // composition that never imports that capability.)
  return selected.map(({ virtual: isVirtual, ...item }) => ({
    ...item,
    packageName: isVirtual ? '' : readPackageName(item.directory),
  }));
}

// Runtime composition: resolve the active set, and for each capability that
// provides the requested surface, load its module and hand the exported value to
// the host's registration. Registry- and framework-agnostic. A build-time host
// uses `resolveSurfaceModules` directly to emit static imports instead.
export async function composeCapabilities(options: {
  workspaceRoot: string;
  capabilitiesDir?: string;
  virtualDescriptors?: readonly Descriptor[];
  bundles?: { cwd: string; fileName?: string };
  seed: CapabilitySelectionSeed;
  surface: string;
  activation: ActivationResolver;
  load: (specifier: string) => Promise<Record<string, unknown>>;
  register: (exportValue: unknown, capability: ResolvedCapability) => void | Promise<void>;
}): Promise<ResolvedCapability[]> {
  const active = resolveSelectedCapabilities({
    workspaceRoot: options.workspaceRoot,
    capabilitiesDir: options.capabilitiesDir ?? 'capabilities',
    ...(options.virtualDescriptors ? { virtualDescriptors: options.virtualDescriptors } : {}),
    ...(options.bundles ? { bundles: options.bundles } : {}),
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
