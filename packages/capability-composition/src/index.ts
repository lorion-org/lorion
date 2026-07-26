import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type {
  CompositionPolicy,
  Descriptor,
  DescriptorId,
  RelationDescriptor,
} from '@lorion-org/composition-graph';
import {
  descriptorSchema,
  discoverDescriptors,
  NESTED_DESCRIPTOR_FIELD,
  findUp,
  loadBundleManifest,
  requirePackageName,
  virtualDescriptorDirectory,
} from '@lorion-org/descriptor-discovery';
import {
  type DescriptorSelectionSeed,
  type ProviderSelectionResolution,
  selectDescriptorsWithProviders,
} from '@lorion-org/descriptor-selection';
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
// Re-export the bundle-manifest loader so a runtime host that needs the declared
// descriptors directly (not just the `bundles` convenience) has one import.
export type {
  ProviderSelectionMode,
  ProviderSelectionResolution,
} from '@lorion-org/descriptor-selection';
export { loadBundleManifest } from '@lorion-org/descriptor-discovery';
export {
  describeComposition,
  formatCompositionReport,
  notResolved,
  type CompositionReport,
  type DescribeCompositionInput,
  type CompositionReportOptions,
  type CompositionReportPalette,
} from './report';
export type {
  ActivationResolver,
  FileSurfaceConventionOptions,
  SurfaceActivation,
  SurfaceConvention,
} from '@lorion-org/surface-activation';

// The selection seed is owned by `@lorion-org/descriptor-selection`, which resolves
// it. Restating it here is how this package's copy came to be missing `key`.
export type CapabilitySelectionSeed = DescriptorSelectionSeed;

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
// discovers a bundle manifest upward and expands it into virtual descriptors. The
// manifest declares descriptors only; the host names its own seed, so a grouping
// file stays reusable across runs that seed it differently.
export interface CapabilitySelectionInput {
  workspaceRoot: string;
  // Where capability descriptors live. `capabilitiesDir` is the one-directory
  // convention; `descriptorPaths` takes glob patterns and wins when both are given,
  // so a host whose capabilities span several roots needs no discovery of its own.
  capabilitiesDir?: string;
  descriptorPaths?: readonly string[];
  // The schema every discovered descriptor is validated against. Defaults to the
  // shared `descriptorSchema`; `false` disables validation, and a host that adds
  // descriptor fields of its own passes an extended schema.
  descriptorSchema?: false | object;
  virtualDescriptors?: readonly Descriptor[];
  bundles?: { cwd: string; fileName?: string };
  // Field in a discovered `capability.json` holding further descriptors, expanded
  // alongside their host. A capability that groups others declares them here
  // instead of in a separate manifest.
  // Defaults to `NESTED_DESCRIPTOR_FIELD`; `false` reads no nested field.
  nestedField?: false | string;
  seed: CapabilitySelectionSeed;
  // Extra relations resolved alongside the provider relations, for a host's own
  // dependency or grouping edges.
  relationDescriptors?: readonly RelationDescriptor[];
  policy?: Partial<CompositionPolicy>;
}

// Every composition option a host adapter must accept and forward, enumerated. A
// host that wraps lorion re-spells these options in its own vocabulary, and the
// only way to know it still carries all of them is to check against a list that
// does not update itself: this one is written by hand and held to
// `CapabilitySelectionInput` in both directions by `index.spec.ts`.
export const CAPABILITY_SELECTION_OPTIONS = [
  'capabilitiesDir',
  'descriptorPaths',
  'descriptorSchema',
  'virtualDescriptors',
  'bundles',
  'nestedField',
  'relationDescriptors',
  'policy',
  'baseDescriptors',
  'defaultSelection',
  'selected',
  'selectionSeed',
] as const;

export type CapabilitySelectionOption = (typeof CAPABILITY_SELECTION_OPTIONS)[number];

// The resolved capabilities together with the provider outcome: which provider won
// each contested capability, in which mode, and which ones lost, plus every
// descriptor id the workspace holds. A host that reports on a composition, names
// an artifact after the selected provider or checks the outcome reads it here
// instead of re-deriving it from the resolved set.
export function resolveCapabilitySelection(options: CapabilitySelectionInput): {
  capabilities: ResolvedCapability[];
  providerSelection: ProviderSelectionResolution;
  // Everything discovery knew about, selected or not: files, nested descriptors
  // and manifest groupings alike. Counting directories instead misses the last two.
  discovered: DescriptorId[];
} {
  const capabilitiesDir = options.capabilitiesDir ?? 'capabilities';
  const descriptorPaths = options.descriptorPaths ?? [`${capabilitiesDir}/*/capability.json`];
  const virtualDescriptors = [
    ...(options.virtualDescriptors ?? []),
    ...(options.bundles ? loadBundleManifest(options.bundles) : []),
  ];
  const seed = options.seed;
  const discovered = discoverDescriptors({
    cwd: options.workspaceRoot,
    descriptorPaths: [...descriptorPaths],
    validation:
      options.descriptorSchema === false
        ? false
        : { schema: options.descriptorSchema ?? descriptorSchema },
    ...(options.nestedField === false
      ? {}
      : { nestedField: options.nestedField ?? NESTED_DESCRIPTOR_FIELD }),
  }).map((entry) => ({
    id: entry.descriptor.id,
    // A nested descriptor owns no package in its host's directory, so it is
    // addressed like any other grouping: a synthetic directory, no package name
    // and no surface.
    directory: entry.nested
      ? virtualDescriptorDirectory(options.workspaceRoot, entry.descriptor.id)
      : entry.cwd,
    descriptor: entry.descriptor,
    virtual: entry.nested,
  }));

  // Virtual descriptors get a synthetic, non-existent directory so the surface
  // marker never matches (they activate nothing) and readPackageName is skipped.
  const virtual = virtualDescriptors.map((descriptor) => ({
    id: descriptor.id,
    directory: virtualDescriptorDirectory(options.workspaceRoot, descriptor.id),
    descriptor,
    virtual: true,
  }));

  const { items: selected, providerSelection } = selectDescriptorsWithProviders({
    items: [...discovered, ...virtual],
    getDescriptor: (item) => item.descriptor,
    withDescriptor: (item, descriptor) => ({ ...item, descriptor }),
    seed,
    ...(options.relationDescriptors ? { relationDescriptors: options.relationDescriptors } : {}),
    ...(options.policy ? { policy: options.policy } : {}),
  });

  // Read package.json only for real, discovered capabilities: virtual grouping
  // descriptors have no package on disk and never resolve a surface. (Reading it
  // lazily here also keeps an unrelated broken package.json from aborting a
  // composition that never imports that capability.)
  const capabilities = selected.map(({ virtual: isVirtual, ...item }) => ({
    ...item,
    packageName: isVirtual ? '' : readPackageName(item.directory),
  }));

  return {
    capabilities,
    providerSelection,
    discovered: [...discovered, ...virtual].map((item) => item.id),
  };
}

// The resolved capabilities alone, for hosts that do not report on the provider
// outcome.
export function resolveSelectedCapabilities(
  options: CapabilitySelectionInput,
): ResolvedCapability[] {
  return resolveCapabilitySelection(options).capabilities;
}

// Runtime composition: resolve the active set, and for each capability that
// provides the requested surface, load its module and hand the exported value to
// the host's registration. Registry- and framework-agnostic. A build-time host
// uses `resolveSurfaceModules` directly to emit static imports instead.
export interface CapabilityCompositionInput extends CapabilitySelectionInput {
  surface: string;
  activation: ActivationResolver;
  load: (specifier: string) => Promise<Record<string, unknown>>;
  register: (exportValue: unknown, capability: ResolvedCapability) => void | Promise<void>;
}

export async function composeCapabilities(
  options: CapabilityCompositionInput,
): Promise<ResolvedCapability[]> {
  // The selection input is forwarded whole. Restating its fields here would let a
  // runtime composition silently resolve a different set than the build-time one
  // the moment the selection contract grows.
  const active = resolveSelectedCapabilities(options);
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

// --- Workspace host loader --------------------------------------------------
//
// Node/Bun plumbing every workspace runtime host would otherwise copy to satisfy
// `composeCapabilities`' `load` callback. It is the runtime counterpart to the
// build-time workspace source aliases: it loads workspace packages from their
// declared `exports`, so a runtime host needs no per-host loading code. Pure
// node/bun (node:fs, node:path, node:url, dynamic import), no product specifics —
// the packages directory and the root markers are parameters. It lives here, next
// to the `load`-consuming host and the existing node-fs binding (`readPackageName`),
// rather than in a separate node-only package: this package is already node-bound,
// carries no env-agnostic core to protect, and `sideEffects: false` lets a bundler
// drop these helpers when a host supplies its own `load`.

// The directory the upward walk starts from: `from` is a file URL
// (`import.meta.url`) or a path. A file resolves to its containing directory; a
// directory is used as-is.
function toStartDirectory(from: string): string {
  const path = from.startsWith('file:') ? fileURLToPath(from) : from;
  try {
    if (statSync(path).isDirectory()) return path;
  } catch {
    // Path does not exist — fall back to treating it as a file and use its parent.
  }
  return dirname(path);
}

// Resolves the workspace root by walking up from `from` until a directory holds ALL
// `markers` (default `['packages']`, the pnpm packages directory). Throws a clear
// error if no ancestor qualifies.
export function resolveWorkspaceRoot(from: string, options: { markers?: string[] } = {}): string {
  const markers = options.markers ?? ['packages'];
  const root = findUp(toStartDirectory(from), (dir) =>
    markers.every((marker) => existsSync(resolve(dir, marker))),
  );
  if (root === undefined) {
    throw new Error(
      `Workspace root not found from "${from}" upward: no ancestor directory contains ${markers
        .map((marker) => `"${marker}"`)
        .join(' + ')}.`,
    );
  }
  return root;
}

// A specifier's workspace package folder and export subpath. A leading scope segment
// is dropped: `@scope/name/a/b` and `name/a/b` both address the folder `name` with
// subpath `./a/b`; a bare `name` (or `@scope/name`) addresses the `.` export.
function parseWorkspaceSpecifier(specifier: string): { folder: string; subpath: string } {
  const segments = specifier.split('/').filter((segment) => segment.length > 0);
  const withoutScope = segments[0]?.startsWith('@') ? segments.slice(1) : segments;
  const [folder, ...rest] = withoutScope;
  if (!folder) {
    throw new Error(`Cannot derive a workspace package folder from specifier "${specifier}".`);
  }
  // A `.`/`..` segment would escape the packages directory once resolved; reject it
  // rather than resolve a path outside the workspace.
  if (folder === '.' || folder === '..') {
    throw new Error(`Invalid workspace package folder "${folder}" from specifier "${specifier}".`);
  }
  return { folder, subpath: rest.length ? `./${rest.join('/')}` : '.' };
}

// Guards that `child` stays inside `parent` after resolution, so neither a `..`
// segment nor a malformed `exports` target can escape the packages directory.
function assertInside(parent: string, child: string, label: string): void {
  const rel = relative(parent, child);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(`${label} "${child}" escapes the workspace directory "${parent}".`);
  }
}

// Resolves an `exports` entry for `subpath` to a relative target file. Supports a
// string target and a conditional object, resolved in `import` > `require` >
// `default` order (nested condition objects are followed the same way) — the loader
// imports the target via `import()`, which loads ESM and CJS alike, so `import` and
// `require` are both runtime-valid; `types` is a declaration-file condition and is
// deliberately never followed. It is a small subset of node resolution — no subpath
// patterns (`./*`), no `node` condition — enough for workspace packages that declare
// plain export targets, including the conditions-only `.` sugar.
function resolveExportTarget(exports: unknown, subpath: string, packageJsonPath: string): string {
  const resolveConditions = (entry: unknown): string | undefined => {
    if (typeof entry === 'string') return entry;
    if (!entry || typeof entry !== 'object') return undefined;
    const conditions = entry as Record<string, unknown>;
    for (const key of ['import', 'require', 'default']) {
      if (key in conditions) {
        const resolved = resolveConditions(conditions[key]);
        if (resolved !== undefined) return resolved;
      }
    }
    return undefined;
  };

  const missing = (): Error =>
    new Error(`No "${subpath}" export resolves to a file in ${packageJsonPath}.`);

  if (typeof exports === 'string') {
    if (subpath === '.') return exports;
    throw missing();
  }
  if (!exports || typeof exports !== 'object') {
    throw new Error(`Package ${packageJsonPath} declares no "exports" to resolve "${subpath}".`);
  }

  // An `exports` object with no subpath keys is node's sugar for the `.` export
  // expressed directly as conditions (e.g. `{ import, require }`).
  const record = exports as Record<string, unknown>;
  const isSubpathMap = Object.keys(record).some((key) => key.startsWith('.'));
  const entry = isSubpathMap ? record[subpath] : subpath === '.' ? record : undefined;
  if (entry === undefined) throw missing();

  const target = resolveConditions(entry);
  if (target === undefined) throw missing();
  return target;
}

// Builds a `load` callback for `composeCapabilities` that imports workspace packages
// from `<workspaceRoot>/<packagesDir>/<folder>` through their declared `exports`.
// `packagesDir` defaults to `'packages'`. A specifier with no matching export throws.
export function createWorkspaceLoad(options: {
  workspaceRoot: string;
  packagesDir?: string;
}): (specifier: string) => Promise<Record<string, unknown>> {
  const packagesDir = options.packagesDir ?? 'packages';
  return async (specifier) => {
    const packagesRoot = resolve(options.workspaceRoot, packagesDir);
    const { folder, subpath } = parseWorkspaceSpecifier(specifier);
    const packageDirectory = resolve(packagesRoot, folder);
    assertInside(packagesRoot, packageDirectory, 'workspace package');
    const packageJsonPath = resolve(packageDirectory, 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { exports?: unknown };
    const relativeTarget = resolveExportTarget(packageJson.exports, subpath, packageJsonPath);
    const target = resolve(packageDirectory, relativeTarget);
    assertInside(packageDirectory, target, 'export target');
    return (await import(pathToFileURL(target).href)) as Record<string, unknown>;
  };
}
