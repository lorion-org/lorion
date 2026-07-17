import { defineWebPlugin } from '@runtime-demo/plugin';

export const authSessionWebPlugin = defineWebPlugin({
  id: 'auth-session',
  title: 'Auth: session strategy',
  render: () => 'Default provider for the auth slot (defaultFor: auth). Session-cookie sign-in.',
});
