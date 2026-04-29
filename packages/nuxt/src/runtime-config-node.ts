import {
  loadRuntimeConfigSourceTree,
  resolveRuntimeConfigSourcePublicRootPath,
  validateRuntimeConfigSourceScopes,
  type RuntimeConfigSchemaTargetInput,
  type RuntimeConfigValidateResult,
  type ValidateRuntimeConfigPatternSourceScopesOptions,
} from '@lorion-org/runtime-config-node';
import { toRuntimeConfigFragment, type RuntimeConfigFragmentMap } from '@lorion-org/runtime-config';
import { createNuxtRuntimeConfig } from './runtime-config';
import type {
  CreateNuxtRuntimeConfigOptions,
  NuxtRuntimeConfig,
  RuntimeConfigNuxtSourceOptions,
} from './types';
export type { RuntimeConfigNuxtSourceOptions } from './types';

export type CreateNuxtRuntimeConfigFromSourceOptions = Omit<
  CreateNuxtRuntimeConfigOptions,
  'fragments' | 'runtimeConfig'
>;

export type ValidateNuxtRuntimeConfigSourceScopesOptions = Omit<
  ValidateRuntimeConfigPatternSourceScopesOptions,
  'fileName' | 'runtimeConfigDirName'
>;

export function resolveNuxtRuntimeConfigPublicRootPath(
  source: RuntimeConfigNuxtSourceOptions,
): string | undefined {
  return resolveRuntimeConfigSourcePublicRootPath(source);
}

export function loadNuxtRuntimeConfigFragments(
  source: RuntimeConfigNuxtSourceOptions,
  options: Pick<CreateNuxtRuntimeConfigOptions, 'contextInputKey'> = {},
): RuntimeConfigFragmentMap {
  const fragments = loadRuntimeConfigSourceTree(source);
  const normalizedFragments: RuntimeConfigFragmentMap = new Map();

  for (const [scopeId, config] of fragments.entries()) {
    normalizedFragments.set(scopeId, toRuntimeConfigFragment(config, options));
  }

  return normalizedFragments;
}

export function createNuxtRuntimeConfigFromSource(
  source: RuntimeConfigNuxtSourceOptions,
  options: CreateNuxtRuntimeConfigFromSourceOptions = {},
): NuxtRuntimeConfig {
  return createNuxtRuntimeConfig({
    ...options,
    fragments: loadNuxtRuntimeConfigFragments(source, {
      ...(options.contextInputKey ? { contextInputKey: options.contextInputKey } : {}),
    }),
  });
}

export function validateNuxtRuntimeConfigSourceScopes(
  source: RuntimeConfigNuxtSourceOptions,
  targets: RuntimeConfigSchemaTargetInput[],
  options: ValidateNuxtRuntimeConfigSourceScopesOptions = {},
): RuntimeConfigValidateResult {
  return validateRuntimeConfigSourceScopes(source, targets, options);
}
