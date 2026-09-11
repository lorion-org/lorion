// What a consumer of the published packages sees. Every workspace tsconfig sets
// `skipLibCheck: true`, so TypeScript never reads the declaration files this
// repository emits; a `.d.ts` can be syntactically invalid and every gate stays
// green. This package imports each published entry point with `skipLibCheck: false`,
// validating the shipped types independently of their API reports.
//
// Namespace imports read each declaration; the assertions below exercise published contracts.

import { expectTypeOf } from 'vitest';
import type { NuxtConfig } from 'nuxt/schema';
import type { LorionNuxtModuleOptions } from '@lorion-org/nuxt';

import type * as capabilityComposition from '@lorion-org/capability-composition';
import type * as compositionGraph from '@lorion-org/composition-graph';
import type * as descriptorDiscovery from '@lorion-org/descriptor-discovery';
import type * as descriptorDiscoverySchema from '@lorion-org/descriptor-discovery/schema';
import type * as descriptorSelection from '@lorion-org/descriptor-selection';
import type * as nuxt from '@lorion-org/nuxt';
import type * as nuxtDescriptorSchema from '@lorion-org/nuxt/descriptor-schema';
import type * as nuxtExtensions from '@lorion-org/nuxt/extensions';
import type * as nuxtRuntimeConfig from '@lorion-org/nuxt/runtime-config';
import type * as nuxtRuntimeConfigNode from '@lorion-org/nuxt/runtime-config-node';
import type * as providerSelection from '@lorion-org/provider-selection';
import type * as react from '@lorion-org/react';
import type * as reactVite from '@lorion-org/react/vite';
import type * as registryHub from '@lorion-org/registry-hub';
import * as runtimeConfig from '@lorion-org/runtime-config';
import type * as runtimeConfigNode from '@lorion-org/runtime-config-node';
import type * as surfaceActivation from '@lorion-org/surface-activation';

// Referencing each namespace keeps the imports from being elided before the
// declaration file is read.
export type PublishedEntryPoints = {
  capabilityComposition: typeof capabilityComposition;
  compositionGraph: typeof compositionGraph;
  descriptorDiscovery: typeof descriptorDiscovery;
  descriptorDiscoverySchema: typeof descriptorDiscoverySchema;
  descriptorSelection: typeof descriptorSelection;
  nuxt: typeof nuxt;
  nuxtDescriptorSchema: typeof nuxtDescriptorSchema;
  nuxtExtensions: typeof nuxtExtensions;
  nuxtRuntimeConfig: typeof nuxtRuntimeConfig;
  nuxtRuntimeConfigNode: typeof nuxtRuntimeConfigNode;
  providerSelection: typeof providerSelection;
  react: typeof react;
  reactVite: typeof reactVite;
  registryHub: typeof registryHub;
  runtimeConfig: typeof runtimeConfig;
  runtimeConfigNode: typeof runtimeConfigNode;
  surfaceActivation: typeof surfaceActivation;
};

// A type-only re-export must not silently remove the constructible public value.
export const validatorRegistry = new runtimeConfig.RuntimeConfigValidatorRegistry({});

// Check the complete published augmentation, including its optionality.
expectTypeOf<Pick<NuxtConfig, 'lorion'>>().toEqualTypeOf<{ lorion?: LorionNuxtModuleOptions }>();
