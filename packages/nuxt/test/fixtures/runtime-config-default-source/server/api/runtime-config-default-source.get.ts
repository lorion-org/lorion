import { getPublicNuxtRuntimeConfigScope } from '../../../../../src/runtime-config';

export default defineEventHandler(() => {
  return getPublicNuxtRuntimeConfigScope(useRuntimeConfig(), 'billing');
});
