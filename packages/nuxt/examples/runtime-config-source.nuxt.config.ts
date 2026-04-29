import { defineNuxtConfig } from 'nuxt/config';
import type {} from '@lorion-org/nuxt';

export default defineNuxtConfig({
  modules: ['@lorion-org/nuxt'],
  lorion: {
    runtimeConfig: {
      source: {
        paths: ['.runtimeconfig/runtime-config/*/runtime.config.json'],
      },
    },
  },
});
