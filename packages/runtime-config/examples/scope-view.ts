import {
  getPrivateRuntimeConfigScope,
  getPublicRuntimeConfigScope,
  projectRuntimeConfigFragment,
  toRuntimeEnvVars,
} from '@lorion-org/runtime-config';

const runtimeConfig = projectRuntimeConfigFragment('auth', {
  public: {
    url: 'https://auth.example.test',
    realm: 'main',
  },
  private: {
    clientSecret: 'secret',
  },
});

console.log(runtimeConfig.public.authUrl);
// 'https://auth.example.test'

console.log(toRuntimeEnvVars(runtimeConfig, 'APP'));
// {
//   APP_PUBLIC_AUTH_URL: 'https://auth.example.test',
//   APP_PUBLIC_AUTH_REALM: 'main',
//   APP_PRIVATE_AUTH_CLIENT_SECRET: 'secret'
// }

console.log(getPublicRuntimeConfigScope(runtimeConfig, 'auth'));
// { url: 'https://auth.example.test', realm: 'main' }

console.log(getPrivateRuntimeConfigScope(runtimeConfig, 'auth'));
// { clientSecret: 'secret' }
