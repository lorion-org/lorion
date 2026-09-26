import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addImports, addPluginTemplate, addTemplate, addTypeTemplate } from '@nuxt/kit';
import { projectContributionPlan, resolveSurfaceEntries } from '@lorion-org/capability-composition';
import { requirePackageName, type PackageSource } from '@lorion-org/descriptor-discovery';
import type { NuxtExtensionBootstrap } from './extensions';

export function registerContributions(bootstrap: NuxtExtensionBootstrap): void {
  const physical = bootstrap.resolvedExtensions.filter((entry) =>
    existsSync(join(entry.cwd, 'package.json')),
  );
  const sources = physical.map((entry): PackageSource => {
    const manifestPath = join(entry.cwd, 'package.json');
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    return {
      name: requirePackageName(manifest, manifestPath),
      root: entry.cwd,
      manifestPath,
      manifest,
    };
  });
  const byId = new Map(physical.map((entry, index) => [entry.descriptor.id, sources[index]!]));
  const entries = resolveSurfaceEntries({
    capabilities: physical.map((entry) => ({
      id: entry.descriptor.id,
      directory: entry.cwd,
      descriptor: entry.descriptor,
      packageName: byId.get(entry.descriptor.id)!.name,
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
    catalog: bootstrap.discoveredExtensions.map((entry) => entry.descriptor),
    selected: bootstrap.resolvedExtensions.map((entry) => entry.descriptor),
  });
  addPluginTemplate({
    filename: 'lorion/contributions-plugin.mjs',
    getContents: () =>
      [
        "import { defineNuxtPlugin } from '#app';",
        "import { ContributionError, createContributionRuntime } from '@lorion-org/contributions';",
        ...entries.map(
          (entry, index) =>
            `import { contributionModule as m${index} } from ${JSON.stringify(entry.entryPath.replaceAll('\\', '/'))};`,
        ),
        `const plan = ${JSON.stringify(plan)};`,
        `const modules = [${entries.map((entry, index) => `{ module: m${index}, identity: ${JSON.stringify(plan.selected.find((identity) => identity.id === entry.capabilityId))} }`).join(',')}].map(({ module, identity }) => { if (module?.id !== identity.id || module?.version !== identity.version) throw new ContributionError('MODULE_IDENTITY_MISMATCH', { source: identity }); return module; });`,
        `export default defineNuxtPlugin({ name: 'lorion-contributions', enforce: 'pre', setup() { return { provide: { contributions: createContributionRuntime({ plan, modules }) } }; } });`,
      ].join('\n'),
  });
  addTemplate({
    filename: 'lorion/contributions.ts',
    write: true,
    getContents: () =>
      "import { useNuxtApp } from '#app';\nimport type { ContributionPoint, ResolvedContributionItem } from '@lorion-org/contributions';\nexport function useLorionContributions<T>(point: ContributionPoint<T>): readonly ResolvedContributionItem<T>[] { const runtime = useNuxtApp().$contributions; if (!runtime) throw new Error('Lorion contributions are not enabled for this application.'); return runtime.get(point); }\n",
  });
  addTypeTemplate({
    filename: 'types/lorion-contributions.d.ts',
    getContents: () =>
      "import type { ContributionRuntime } from '@lorion-org/contributions';\ndeclare module '#app' { interface NuxtApp { $contributions: ContributionRuntime } }\nexport {};\n",
  });
  addImports({ name: 'useLorionContributions', from: '#build/lorion/contributions' });
}
