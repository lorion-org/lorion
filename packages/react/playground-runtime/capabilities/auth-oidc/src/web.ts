import { defineWebPlugin } from '@runtime-demo/plugin';

export const authOidcWebPlugin = defineWebPlugin({
  id: 'auth-oidc',
  title: 'Auth: OIDC strategy',
  render: () =>
    'Alternative provider for the auth slot. Selecting it through the seed wins over the default and drops auth-session.',
});
