import type { Descriptor } from '@lorion-org/composition-graph';
import type { RuntimeConfigValidationPolicyInput } from '@lorion-org/runtime-config';

// A descriptor as the shared schema describes it: the graph fields from
// `Descriptor` plus the runtime-config fields a host reads off a descriptor. The
// graph package owns dependency resolution and knows nothing of runtime config, so
// those two types come from the package that does.
//
// Reading one of these through `Descriptor`'s index signature yields `unknown` and
// forces a cast at every use site. Declaring them here is what lets a caller read
// `descriptor.runtimeConfig` and get a typed value.
export type SchemaDescriptor = Descriptor & {
  // What this descriptor is, for a reader. A capability slot in particular carries
  // nothing else that says what it is: it is an id others provide for, and without
  // a sentence here nobody can tell it apart from an empty grouping.
  description?: string;
  runtimeConfig?: RuntimeConfigValidationPolicyInput;
  publicRuntimeConfig?: Record<string, unknown>;
};

// Every field a descriptor declares. `Descriptor` carries an index signature so a
// host can attach its own data, which makes `keyof` useless for stating the
// declared set; this union states it instead.
//
// It is held to `descriptor.schema.json` in both directions by a compile-time check
// in `descriptor.spec.ts`. The check lives in the test rather than here because
// deriving it needs the JSON as a type, and a JSON import reachable from the
// package entry is inlined as a value into the emitted declaration file.
export type DescriptorField =
  | 'id'
  | 'version'
  | 'description'
  | 'providesFor'
  | 'defaultFor'
  | 'capabilities'
  | 'dependencies'
  | 'disabled'
  | 'location'
  | 'bundles'
  | 'runtimeConfig'
  | 'publicRuntimeConfig';
