import { describe, expect, it } from 'vitest';

import type bundleManifestSchemaData from './bundles.schema.json';
import type { DescriptorField, SchemaDescriptor } from './descriptor';
import type descriptorSchemaData from './descriptor.schema.json';

// `descriptor.schema.json` is the single definition of which fields a descriptor
// has. These checks read the field names back out of it at compile time and bind
// both the declared union and the typed descriptor to it, so the three cannot
// drift. They live in a test because a JSON import reachable from the package
// entry is inlined as a value into the emitted declaration file.
type DescriptorSchemaProperties = typeof descriptorSchemaData.$defs.descriptor.properties;
type SchemaField = Exclude<keyof DescriptorSchemaProperties, 'providerPreferences'>;
type RemovedProviderPreferencesStillAccepted =
  false extends DescriptorSchemaProperties['providerPreferences'] ? never : 'providerPreferences';

// A field the schema declares but `DescriptorField` does not, and the reverse.
type FieldsOnlyInSchema = Exclude<SchemaField, DescriptorField>;
type FieldsOnlyInUnion = Exclude<DescriptorField, SchemaField>;

// A field named in `DescriptorField` but not actually declared on
// `SchemaDescriptor` falls through to `Descriptor`'s index signature and reads back
// as `unknown`, which is the untyped state this type exists to end.
type UndeclaredOnType = {
  [Field in DescriptorField]: unknown extends SchemaDescriptor[Field] ? Field : never;
}[DescriptorField];

// The manifest wrapper is a second schema with a second contract: it declares
// bundles and a schema pointer, and nothing else.
type ManifestKey = keyof typeof bundleManifestSchemaData.properties;
type UnexpectedManifestKey = Exclude<ManifestKey, '$schema' | 'bundles'>;
type MissingManifestKey = Exclude<'$schema' | 'bundles', ManifestKey>;

type Conformance = [
  FieldsOnlyInSchema,
  FieldsOnlyInUnion,
  UndeclaredOnType,
  RemovedProviderPreferencesStillAccepted,
  UnexpectedManifestKey,
  MissingManifestKey,
] extends [never, never, never, never, never, never]
  ? true
  : never;

describe('descriptor schema conformance', () => {
  it('declares the same fields in the schema and in TypeScript', () => {
    const conforms: Conformance = true;
    expect(conforms).toBe(true);
  });
});
