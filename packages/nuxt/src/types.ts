import type {
  NamedRuntimeConfigFragment,
  ProjectSectionedRuntimeConfigOptions,
  RuntimeConfigFragment,
  RuntimeConfigFragmentMap,
  RuntimeConfigSection,
  SectionedRuntimeConfig,
} from '@lorion-org/runtime-config';
import type { ProviderPreferenceMap, ProviderSelection } from '@lorion-org/provider-selection';
import type { DescriptorSelectionSeedInput } from '@lorion-org/composition-graph';
import type {
  RuntimeConfigPathPatternSource,
  ValidateRuntimeConfigPatternSourceScopesOptions,
} from '@lorion-org/runtime-config-node';
import type { JsonSchemaObject } from './descriptor-schema';
import type {
  CapabilitySelectionInput,
  CapabilitySelectionSeed,
} from '@lorion-org/capability-composition';
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
  fallbackProviders?: ProviderPreferenceMap;
  selectedProviders?: ProviderPreferenceMap;
};

export type NuxtProviderSelectionRuntimeConfig = {
  configuredProviders: ProviderPreferenceMap;
  excludedProviderIds: string[];
  fallbackProviders: ProviderPreferenceMap;
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

export type NuxtExtensionSelectionSeedOptions = Omit<DescriptorSelectionSeedInput, 'defaultValue'>;

// The shared composition options, plus the ones this adapter owns. The shared half
// is derived from `CapabilitySelectionInput` rather than restated, so an option the
// core gains is an option this module accepts, and a conformance test holds it to
// forwarding each one (see test/unit/module.spec.ts).
export type NuxtExtensionModuleOptions = Partial<
  Omit<CapabilitySelectionInput, 'seed' | 'workspaceRoot' | 'descriptorSchema'>
> &
  Omit<CapabilitySelectionSeed, 'selectionSeed'> & {
    descriptorSchema?: false | JsonSchemaObject;
    // Turns this module's composition off entirely, which a statically declared Nuxt
    // module needs and a Vite plugin expresses by not being added.
    enabled?: boolean;
    selectionSeed?: false | NuxtExtensionSelectionSeedOptions;
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
