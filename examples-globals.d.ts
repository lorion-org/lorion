declare function defineNuxtPlugin<T>(plugin: () => T): T;
declare function defineEventHandler<T>(handler: () => T): T;
declare function usePublicRuntimeConfigScope<T = Record<string, unknown>>(scopeId: string): T;
