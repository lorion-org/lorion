import { defineWebPlugin } from '@acme/plugin';
import { TechMonitorPage } from './TechMonitorPage';

export const webWebPlugin = defineWebPlugin({
  id: 'web',
  routes: [{ path: '/tech', Component: TechMonitorPage }],
});
