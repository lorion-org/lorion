import extensionDescriptorSchemaData from './extension-descriptor.schema.json';

export type JsonSchemaObject = Record<string, unknown>;

export const nuxtExtensionDescriptorSchema = extensionDescriptorSchemaData as JsonSchemaObject;
