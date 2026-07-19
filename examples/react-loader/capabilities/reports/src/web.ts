import { defineWebPlugin } from '@acme/plugin';

export const reportsWebPlugin = defineWebPlugin({
  id: 'reports',
  title: 'Reports',
  render: () => 'Optional feature (not in defaultSelection). Add it through the seed to activate.',
});
