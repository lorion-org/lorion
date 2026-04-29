import { toSnakeUpperCase } from './key';
import {
  projectSectionedRuntimeConfig,
  type ProjectSectionedRuntimeConfigOptions,
} from './project';
import {
  runtimeConfigVisibilities,
  type ConfigVisibility,
  type NamedRuntimeConfigFragment,
  type RuntimeConfigFragmentMap,
  type RuntimeEnvVars,
  type SectionedRuntimeConfig,
} from './types';

export type ProjectRuntimeConfigEnvVarsOptions = ProjectSectionedRuntimeConfigOptions & {
  prefix?: string;
};

export function createRuntimeConfigEnvKey(input: {
  key: string;
  prefix?: string;
  scopeId?: string;
  visibility?: ConfigVisibility;
}): string {
  return toSnakeUpperCase(
    [input.prefix ?? 'APP', input.visibility, input.scopeId, input.key].filter(Boolean).join('_'),
  );
}

export function toRuntimeEnvVars(
  runtimeConfig: SectionedRuntimeConfig,
  prefix = 'APP',
): RuntimeEnvVars {
  const envVars: RuntimeEnvVars = {};

  for (const visibility of runtimeConfigVisibilities) {
    for (const [key, value] of Object.entries(runtimeConfig[visibility])) {
      if (key.startsWith('__')) continue;

      envVars[createRuntimeConfigEnvKey({ prefix, visibility, key })] = value;
    }
  }

  return envVars;
}

export function projectRuntimeConfigEnvVars(
  fragments: Iterable<NamedRuntimeConfigFragment> | RuntimeConfigFragmentMap,
  options: ProjectRuntimeConfigEnvVarsOptions = {},
): RuntimeEnvVars {
  const { prefix = 'APP', ...projectOptions } = options;

  return toRuntimeEnvVars(
    projectSectionedRuntimeConfig(fragments, {
      ...projectOptions,
      includeContexts: false,
    }),
    prefix,
  );
}

export function injectRuntimeEnvVars(
  envVars: RuntimeEnvVars,
  processEnv: Record<string, unknown>,
): RuntimeEnvVars {
  const items: RuntimeEnvVars = {};

  for (const key of Object.keys(envVars)) {
    items[key] = processEnv[key] ?? envVars[key];
  }

  return items;
}

export function runtimeEnvVarsToString(envVars: RuntimeEnvVars): string {
  return Object.entries(envVars)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join('\n');
}

export function runtimeEnvValueToShellLiteral(value: unknown): string {
  const json = JSON.stringify(value) ?? 'undefined';

  return `'${json.replace(/'/g, "'\\''")}'`;
}

export function runtimeEnvVarsToShellAssignments(envVars: RuntimeEnvVars): string {
  return Object.entries(envVars)
    .map(([key, value]) => `${key}=${runtimeEnvValueToShellLiteral(value)}`)
    .join('\n');
}
