// The CommonJS half of the same check. Under `moduleResolution: Bundler` only the
// `import` condition resolves, so the `.d.cts` files a package ships are never read.
// This file is compiled with `module`/`moduleResolution: Node16`, which picks the
// `require` condition and pulls in the declarations the ESM twin cannot reach.
//
// `@lorion-org/nuxt` is ESM-only, so it ships no CommonJS declaration and is absent
// here by design. Every other published entry point is present.
import type * as capabilityComposition from '@lorion-org/capability-composition';
import type * as compositionGraph from '@lorion-org/composition-graph';
import type * as descriptorDiscovery from '@lorion-org/descriptor-discovery';
import type * as descriptorDiscoverySchema from '@lorion-org/descriptor-discovery/schema';
import type * as descriptorSelection from '@lorion-org/descriptor-selection';
import type * as providerSelection from '@lorion-org/provider-selection';
import type * as react from '@lorion-org/react';
import type * as reactVite from '@lorion-org/react/vite';
import type * as registryHub from '@lorion-org/registry-hub';
import type * as runtimeConfig from '@lorion-org/runtime-config';
import type * as runtimeConfigNode from '@lorion-org/runtime-config-node';
import type * as surfaceActivation from '@lorion-org/surface-activation';

export type PublishedCommonJsEntryPoints = {
  capabilityComposition: typeof capabilityComposition;
  compositionGraph: typeof compositionGraph;
  descriptorDiscovery: typeof descriptorDiscovery;
  descriptorDiscoverySchema: typeof descriptorDiscoverySchema;
  descriptorSelection: typeof descriptorSelection;
  providerSelection: typeof providerSelection;
  react: typeof react;
  reactVite: typeof reactVite;
  registryHub: typeof registryHub;
  runtimeConfig: typeof runtimeConfig;
  runtimeConfigNode: typeof runtimeConfigNode;
  surfaceActivation: typeof surfaceActivation;
};
