import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectContributionPlan, resolveSurfaceEntries } from '@lorion-org/capability-composition';
import type { Descriptor } from '@lorion-org/composition-graph';
import type { PackageSource } from '@lorion-org/descriptor-discovery';
import type { DiscoveredCapability } from './vite';

export function createContributionSource(
  capabilities: readonly DiscoveredCapability[],
  catalog: readonly Descriptor[],
  packageSources?: readonly PackageSource[],
): string {
  const physical = capabilities.filter((entry) => entry.packageName);
  const sources =
    packageSources ??
    physical.map(
      (entry): PackageSource => ({
        name: entry.packageName,
        root: entry.capabilityDir,
        manifestPath: join(entry.capabilityDir, 'package.json'),
        manifest: JSON.parse(
          readFileSync(join(entry.capabilityDir, 'package.json'), 'utf8'),
        ) as Record<string, unknown>,
      }),
    );
  const byId = new Map(
    physical.map((entry) => [
      entry.id,
      sources.find((source) => source.root === entry.capabilityDir),
    ]),
  );
  const entries = resolveSurfaceEntries({
    capabilities: physical.map((entry) => ({
      id: entry.id,
      descriptor: entry.manifest,
      directory: entry.capabilityDir,
      packageName: entry.packageName,
    })),
    surface: 'contributions',
    packageSources: sources,
    activation: (_surface, capability) => {
      const exports = byId.get(capability.id)?.manifest.exports;
      return exports && typeof exports === 'object' && Object.hasOwn(exports, './contributions')
        ? { exportSubpath: './contributions', exportName: 'contributionModule' }
        : undefined;
    },
  });
  const plan = projectContributionPlan({
    catalog,
    selected: capabilities.map((entry) => entry.manifest),
  });
  return [
    "import { ContributionError } from '@lorion-org/contributions';",
    ...entries.map(
      (entry, index) =>
        `import { contributionModule as m${index} } from ${JSON.stringify(entry.entryPath.replaceAll('\\', '/'))};`,
    ),
    `export const contributionPlan = ${JSON.stringify(plan)};`,
    `export const contributionModules = [${entries.map((entry, index) => `{ module: m${index}, identity: ${JSON.stringify(plan.selected.find((identity) => identity.id === entry.capabilityId))} }`).join(',')}].map(({ module, identity }) => { if (module?.id !== identity.id || module?.version !== identity.version) throw new ContributionError('MODULE_IDENTITY_MISMATCH', { source: identity }); return module; });`,
  ].join('\n');
}
