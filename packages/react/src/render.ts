import type { DescriptorId } from '@lorion-org/composition-graph';
import type { DiscoveredCapability, ReactRuntimeConfig } from './vite';

// The source of the virtual modules the loader emits. Internal: what a build writes
// into `virtual:capabilities` is an implementation of the loader, not something a
// host calls, and publishing it would freeze the emitted text into the contract.

export function renderCapabilityModule(
  capabilities: readonly DiscoveredCapability[],
  selected: readonly DescriptorId[] = [],
): string {
  // Only capabilities with a resolved activation entry are imported and
  // registered. Graph-only capabilities take part in dependency resolution and
  // still appear in resolvedCapabilityIds, but emit no import.
  const activated = capabilities.filter(
    (capability) => capability.exportName && capability.importSpecifier,
  );
  const imports = activated
    .map(
      (capability) =>
        `import { ${capability.exportName} as ${capability.variableName} } from '${capability.importSpecifier}'`,
    )
    .join('\n');
  const variables = activated.map((capability) => `  ${capability.variableName},`).join('\n');
  const capabilityIds = capabilities.map((capability) => capability.id);

  return `${imports}

export const selectedCapabilityIds = ${JSON.stringify([...selected])}

export const resolvedCapabilityIds = ${JSON.stringify(capabilityIds)}

export const capabilityModules = [
${variables}
]
`;
}

export function renderRuntimeConfigModule(runtimeConfig: ReactRuntimeConfig): string {
  return `export const capabilityRuntimeConfig = ${JSON.stringify({ public: runtimeConfig.public })}

export const publicCapabilityRuntimeConfig = capabilityRuntimeConfig.public
`;
}

export function renderServerRuntimeConfigModule(runtimeConfig: ReactRuntimeConfig): string {
  return `export const capabilityServerRuntimeConfig = ${JSON.stringify(runtimeConfig)}
`;
}
