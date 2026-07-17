import { defineWebPlugin } from '@runtime-demo/plugin';

export const dashboardWebPlugin = defineWebPlugin({
  id: 'dashboard',
  title: 'Dashboard',
  render: () => 'Default feature (in defaultSelection). KPIs and recent activity.',
});
