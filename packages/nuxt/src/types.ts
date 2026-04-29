import type { JsonSchemaObject } from '@lorion-org/descriptor-discovery';
import type {
  NamedRuntimeConfigFragment,
  ProjectSectionedRuntimeConfigOptions,
  RuntimeConfigFragment,
  RuntimeConfigFragmentMap,
  RuntimeConfigSection,
  SectionedRuntimeConfig,
} from '@lorion-org/runtime-config';
import type { ProviderPreferenceMap, ProviderSelection } from '@lorion-org/provider-selection';
import type { Descriptor, RelationDescriptor } from '@lorion-org/composition-graph';
import type {
  RuntimeConfigPathPatternSource,
  ValidateRuntimeConfigPatternSourceScopesOptions,
} from '@lorion-org/runtime-config-node';
import type { NuxtExtensionBootstrap } from './extensions';

export type RuntimeConfigNuxtFragmentInput = RuntimeConfigFragment & Record<string, unknown>;

export type RuntimeConfigNuxtFragments =
  | RuntimeConfigFragmentMap
  | NamedRuntimeConfigFragment[]
  | Record<string, RuntimeConfigNuxtFragmentInput>;

export type RuntimeConfigNuxtSourceOptions = RuntimeConfigPathPatternSource;

export type NuxtPrivateRuntimeConfigMode = 'root' | 'section';

export type NuxtRuntimeConfig = RuntimeConfigSection & {
  public: RuntimeConfigSection;
};

export type NuxtRuntimeConfigInput = RuntimeConfigSection & {
  public?: RuntimeConfigSection;
};

export type CreateNuxtRuntimeConfigOptions = ProjectSectionedRuntimeConfigOptions & {
  contextInputKey?: string;
  fragments?: RuntimeConfigNuxtFragments;
  privateOutput?: NuxtPrivateRuntimeConfigMode;
  runtimeConfig?: SectionedRuntimeConfig;
};

export type ReadNuxtRuntimeConfigOptions = {
  privateInput?: NuxtPrivateRuntimeConfigMode;
};

export type RuntimeConfigNuxtModuleOptions = Omit<CreateNuxtRuntimeConfigOptions, 'scopeIds'> & {
  enabled?: boolean;
  imports?: boolean;
  publicAssets?:
    | boolean
    | {
        maxAge?: number;
      };
  source?: RuntimeConfigNuxtSourceOptions;
  validation?: false | NuxtRuntimeConfigValidationOptions;
};

export type NuxtRuntimeConfigValidationOptions = Pick<
  ValidateRuntimeConfigPatternSourceScopesOptions,
  'formatError' | 'schemaFileName'
>;

export type NuxtProviderSelectionModuleOptions = {
  configuredProviders?: ProviderPreferenceMap;
  enabled?: boolean;
};

export type NuxtProviderSelectionRuntimeConfig = {
  configuredProviders: ProviderPreferenceMap;
  excludedProviderIds: string[];
  mismatches: Array<{
    capabilityId: string;
    configuredProviderId: string;
  }>;
  selections: Record<string, ProviderSelection>;
};

export type NuxtExtensionSelectionRuntimeConfig = {
  discoveredExtensionIds: string[];
  resolvedExtensionIds: string[];
  selectedExtensionIds: string[];
};

export type NuxtExtensionSelection = NuxtExtensionSelectionRuntimeConfig & {
  notInjectedExtensionIds: string[];
};

export type NuxtExtensionBootstrapLogEvent = {
  bootstrap: NuxtExtensionBootstrap;
  providerSelection?: NuxtProviderSelectionRuntimeConfig;
};

export type NuxtExtensionBootstrapReporter = (event: NuxtExtensionBootstrapLogEvent) => void;

export type NuxtBaseExtensionSelectionInput = {
  descriptors: Descriptor[];
  selectedExtensions: string[];
};

export type NuxtBaseExtensionSelection =
  | string
  | string[]
  | ((input: NuxtBaseExtensionSelectionInput) => string[]);

export type NuxtExtensionModuleOptions = {
  baseExtensions?: NuxtBaseExtensionSelection;
  defaultSelection?: string | string[];
  descriptorSchema?: false | JsonSchemaObject;
  descriptorPaths?: string[];
  enabled?: boolean;
  relationDescriptors?: RelationDescriptor[];
  selected?: string | string[];
};

export type LorionNuxtModuleOptions = {
  extensionBootstrap?: NuxtExtensionBootstrap;
  extensions?: NuxtExtensionModuleOptions;
  logging?:
    | boolean
    | {
        reporter?: NuxtExtensionBootstrapReporter;
      };
  providers?: NuxtProviderSelectionModuleOptions;
  runtimeConfig?: RuntimeConfigNuxtModuleOptions;
};

declare module 'nuxt/schema' {
  interface NuxtConfig {
    lorion?: LorionNuxtModuleOptions;
  }
}
