import { defineNuxtPlugin } from '#app';
import { ContributionError } from '@lorion-org/contributions';

// This test observer records the native startup failure without handling or replacing it.
export default defineNuxtPlugin({
  name: 'contribution-failure-observer',
  order: -100,
  setup(app) {
    app.hook('app:error', (error) => {
      if (import.meta.server && error instanceof ContributionError) {
        app.ssrContext?.event.node.res.setHeader(
          'x-lorion-contribution-error',
          JSON.stringify({
            code: error.code,
            details: error.details,
            runtimeExposed: '$contributions' in app,
          }),
        );
      }
    });
  },
});
