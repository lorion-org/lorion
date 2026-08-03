// The Nuxt adapter validates against the shared descriptor schema. Every property
// it needs is declared there, so this module re-exports rather than defining a
// second shape: `bundles`, `runtimeConfig` and `publicRuntimeConfig` are core
// descriptor fields, not adapter-specific ones.
export { descriptorSchema, type JsonSchemaObject } from '@lorion-org/descriptor-discovery';
