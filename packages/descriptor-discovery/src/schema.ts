import descriptorSchemaData from './descriptor.schema.json';

export type JsonSchemaObject = Record<string, unknown>;

export const descriptorSchema = descriptorSchemaData as JsonSchemaObject;
