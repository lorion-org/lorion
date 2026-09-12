import baseConfig from './vitest.config.mts';

export default {
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: [
      'packages/*/src/**/*.spec.ts',
      'packages/nuxt/test/unit/**/*.spec.ts',
      'packages/nuxt/test/*.e2e.spec.ts',
    ],
    setupFiles: ['./tools/assert-bun-runtime.mjs'],
    testTimeout: 60000,
  },
};
