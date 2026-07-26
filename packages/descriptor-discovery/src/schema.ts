import bundleManifestSchemaData from './bundles.schema.json';
import descriptorSchemaData from './descriptor.schema.json';

export type JsonSchemaObject = Record<string, unknown>;

export const descriptorSchema = descriptorSchemaData as JsonSchemaObject;

// The shape of a bundle manifest file. Its entries are held to `descriptorSchema`
// separately and unchanged, so this states only what the wrapper may contain:
// `bundles`, an optional `$schema` pointer, nothing else. A run-wide key in a
// grouping file is therefore reported instead of ignored.
export const bundleManifestSchema = bundleManifestSchemaData as JsonSchemaObject;
