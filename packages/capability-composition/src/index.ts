import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  createCompositionSelection,
  createDescriptorCatalog,
  resolveDescriptorSelectionSeed,
  type CompositionPolicy,
  type Descriptor,
  type DescriptorId,
  type RelationDescriptor,
} from '@lorion-org/composition-graph';
import { descriptorSchema, discoverDescriptors } from '@lorion-org/descriptor-discovery';
import {
  collectSelectedProviderPreferences,
  resolveSelectedProviderRelationPreferences,
  type ProviderPreferenceMap,
} from '@lorion-org/provider-selection';

// Capability composition model: how a set of descriptor-defined capabilities is
// selected, activated, and composed at runtime. Framework-free, so any host
// (React/Vite build, a Bun server, another runtime) reuses one composition brain
// and only supplies its own activation convention and registration.

const RESOLUTION_RELATIONS = ['dependencies', 'defaultProviders', 'providerPreferences'] as const;

const CAPABILITY_RELATION_DESCRIPTORS: RelationDescriptor[] = [
  { direction: 'incoming', field: 'defaultFor', id: 'defaultProviders' },
  { field: 'providerPreferences', id: 'providerPreferences', targetMode: 'values' },
];

function capabilityCompositionPolicy(
  policy?: Partial<CompositionPolicy>,
): Partial<CompositionPolicy> {
  return {
    ...policy,
    inspectionRelationIds: policy?.inspectionRelationIds ?? [...RESOLUTION_RELATIONS],
    provenanceRelationIds: policy?.provenanceRelationIds ?? [...RESOLUTION_RELATIONS],
    resolutionRelationIds: policy?.resolutionRelationIds ?? [...RESOLUTION_RELATIONS],
  };
}

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

function resolveSeed(seed: CapabilitySelectionSeed): DescriptorId[] {
  if (seed.selected?.length) return [...seed.selected];
  if (seed.selectionSeed === false) return [...(seed.defaultSelection ?? [])];
  const options = seed.selectionSeed ?? {};
  const selected = resolveDescriptorSelectionSeed({
    argv: options.argv ?? process.argv,
    env: options.env ?? process.env,
    key: 'capability',
    ...(options.cliKeys ? { cliKeys: options.cliKeys } : {}),
    ...(options.envKeys ? { envKeys: options.envKeys } : {}),
  });
  return selected.length ? selected : [...(seed.defaultSelection ?? [])];
}

// Resolves the active capability set: base + seed + transitive dependencies +
// exactly one provider per capability.
export function resolveSelectedCapabilities(options: {
  workspaceRoot: string;
  capabilitiesDir?: string;
  seed: CapabilitySelectionSeed;
  policy?: Partial<CompositionPolicy>;
}): ResolvedCapability[] {
  const capabilitiesDir = options.capabilitiesDir ?? 'capabilities';
  const items: ResolvedCapability[] = discoverDescriptors({
    cwd: options.workspaceRoot,
    descriptorPaths: [`${capabilitiesDir}/*/capability.json`],
    validation: { schema: descriptorSchema },
  }).map((entry) => ({
    id: entry.descriptor.id,
    directory: entry.cwd,
    packageName: readPackageName(entry.cwd),
    descriptor: entry.descriptor,
  }));

  const selected = resolveSeed(options.seed);
  if (!selected.length && !options.seed.baseDescriptors?.length) return items;

  const selectedProviders = collectSelectedProviderPreferences({
    items,
    getCapabilityId: (item) => item.descriptor.providesFor,
    getProviderId: (item) => item.id,
    selectedProviderIds: selected,
  });

  const selectionItems = Object.keys(selectedProviders).length
    ? items.map((item) => {
        const manifest: Descriptor = { ...item.descriptor };
        const preferences = resolveSelectedProviderRelationPreferences({
          providerId: item.id,
          defaultFor: manifest.defaultFor,
          providerPreferences: manifest.providerPreferences as ProviderPreferenceMap | undefined,
          selectedProviders,
        });
        delete manifest.defaultFor;
        delete manifest.providerPreferences;
        return { ...item, descriptor: { ...manifest, ...preferences } };
      })
    : items;

  const catalog = createDescriptorCatalog({
    descriptors: selectionItems.map((item) => item.descriptor),
    relationDescriptors: CAPABILITY_RELATION_DESCRIPTORS,
  });
  const selection = createCompositionSelection({
    catalog,
    selected: [...selected],
    baseDescriptors: [...(options.seed.baseDescriptors ?? [])],
    policy: capabilityCompositionPolicy(options.policy),
  });
  const resolvedIds = new Set(selection.getResolved());

  return selectionItems.filter((item) => resolvedIds.has(item.id));
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

// Runtime composition: resolve the active set, and for each capability that
// provides the requested surface, load its module and hand the exported value to
// the host's registration. Registry- and framework-agnostic.
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

  for (const capability of active) {
    const entry = options.activation(options.surface, {
      directory: capability.directory,
      id: capability.id,
    });
    if (!entry) continue;
    const specifier = `${capability.packageName}${entry.exportSubpath.slice(1)}`;
    const module = await options.load(specifier);
    const exportValue = module[entry.exportName];
    if (exportValue === undefined) continue;
    await options.register(exportValue, capability);
    activated.push(capability);
  }

  return activated;
}
