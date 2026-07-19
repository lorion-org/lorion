import { defineWebPlugin } from '@acme/plugin';

export const authLocalWebPlugin = defineWebPlugin({
  id: 'auth-local',
  title: 'Auth: local strategy',
  render: () => 'Default provider for the auth slot (defaultFor: auth). Local sign-in.',
});
