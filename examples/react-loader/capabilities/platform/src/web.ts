import { defineWebPlugin } from '@acme/plugin';

export const platformWebPlugin = defineWebPlugin({
  id: 'platform',
  title: 'Platform shell',
  render: () =>
    'Always-on base: navigation frame and shared layout. Depends on the graph-only tokens library.',
});
