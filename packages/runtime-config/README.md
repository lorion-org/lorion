# @lorion-org/runtime-config

Pure runtime-config contracts and helpers.

This package is free from file-system and framework dependencies.

It models small runtime-config fragments, projects them into runtime objects, and
creates deterministic environment variable names for adapter layers.

## Install

```shell
pnpm add @lorion-org/runtime-config
```

## What it is

- typed contracts for runtime-config fragments
- deterministic scope/key normalization
- projection helpers for flat sectioned runtime config
- projection helpers for namespaced runtime config objects
- configurable context input keys for adapter-specific fragment shapes
- context-aware lookup helpers
- scope-view helpers for reading flat runtime config through unprefixed keys
- environment variable rendering helpers

## What it is not

- not a framework module
- not a file-system loader
- not a schema validator
- not a config-file parser
- not an application-specific naming policy

## Adapter integration

Framework adapters can wire this package into their runtime config transport.
For Nuxt, use `@lorion-org/nuxt`.

The intended adapter shape is:

- projects define local fragments with unprefixed keys
- adapters map those fragments into the target runtime transport
- usage code can read back unprefixed public/private scope views
- application-specific names, file names, and defaults stay in the consuming adapter

Adapters may accept existing fragment field names and map them to generic
contexts with `contextInputKey`. For example, a project can read `tenants`
from its files while this package still works with the generic `contexts`
model internally.

## The three runtime-config shapes

This package separates the local config shape from the runtime transport shape.

### 1. Fragment shape

Fragments are written in local scope vocabulary. The scope id is not repeated in
the keys.

```ts
const authFragment = {
  public: {
    url: 'https://auth.example.test',
    realm: 'main',
  },
  private: {
    clientSecret: 'secret',
  },
};
```

This is the shape that JSON files and schemas usually describe.

### 2. Flat runtime shape

Some runtimes need one shared `public` and `private` object. The scope id becomes
a transport prefix so many fragments can coexist without key collisions.

```ts
const runtimeConfig = projectSectionedRuntimeConfig(new Map([['auth', authFragment]]));

// For a single fragment, use:
projectRuntimeConfigFragment('auth', authFragment);

runtimeConfig.public.authUrl;
// => 'https://auth.example.test'
runtimeConfig.private.authClientSecret;
// => 'secret'
```

### 3. Environment variable shape

Environment variables keep the same transport prefix and add visibility.

```ts
toRuntimeEnvVars(runtimeConfig, 'APP');
// => {
//   APP_PUBLIC_AUTH_URL: 'https://auth.example.test',
//   APP_PUBLIC_AUTH_REALM: 'main',
//   APP_PRIVATE_AUTH_CLIENT_SECRET: 'secret'
// }
```

Usage code can read the flat runtime shape back through local keys:

```ts
const auth = getPublicRuntimeConfigScope(runtimeConfig, 'auth');

auth.url;
// => 'https://auth.example.test'
```

## Basic example

```ts
import {
  getPublicRuntimeConfigScope,
  projectSectionedRuntimeConfig,
  resolveRuntimeConfigValue,
} from '@lorion-org/runtime-config';

const fragments = new Map([
  [
    'billing',
    {
      public: {
        apiBase: '/api/billing',
      },
      private: {
        apiSecret: 'secret',
      },
      contexts: {
        tenantA: {
          public: {
            apiBase: '/tenant-a/billing',
          },
        },
      },
    },
  ],
]);

const runtimeConfig = projectSectionedRuntimeConfig(fragments);

runtimeConfig.public.billingApiBase;
// => '/api/billing'

resolveRuntimeConfigValue(runtimeConfig.public, 'billing', 'apiBase', {
  contextId: 'tenantA',
});
// => '/tenant-a/billing'

getPublicRuntimeConfigScope(runtimeConfig, 'billing');
// => { apiBase: '/api/billing' }
```

## Example: custom context input key

```ts
import { projectSectionedRuntimeConfig } from '@lorion-org/runtime-config';

projectSectionedRuntimeConfig(
  [
    {
      scopeId: 'billing',
      config: {
        public: {
          apiBase: '/api/billing',
        },
        tenants: {
          tenantA: {
            public: {
              apiBase: '/tenant-a/billing',
            },
          },
        },
      },
    },
  ],
  {
    contextInputKey: 'tenants',
    contextOutputKey: '__tenants',
  },
);
// => {
//   public: {
//     billingApiBase: '/api/billing',
//     __tenants: {
//       tenantA: {
//         billingApiBase: '/tenant-a/billing'
//       }
//     }
//   },
//   private: {}
// }
```

## Example: namespaced projection

Use `projectRuntimeConfigNamespace()` when one local fragment becomes one
runtime namespace. Use `projectRuntimeConfigNamespaces()` when combining many
fragments; in that case each item needs a `scopeId` so the output namespace is
explicit.

```ts
import {
  projectRuntimeConfigNamespace,
  projectRuntimeConfigNamespaces,
} from '@lorion-org/runtime-config';

const runtimeConfig = projectRuntimeConfigNamespace('mail', {
  public: {
    apiBase: '/api/mail',
  },
  private: {
    token: 'mail-token',
  },
});

runtimeConfig.public.mail;
// => { apiBase: '/api/mail' }
runtimeConfig.mail;
// => { token: 'mail-token' }

const combinedRuntimeConfig = projectRuntimeConfigNamespaces([
  {
    scopeId: 'mail',
    config: {
      public: {
        apiBase: '/api/mail',
      },
      private: {
        token: 'mail-token',
      },
    },
  },
]);

combinedRuntimeConfig.public.mail;
// => { apiBase: '/api/mail' }
combinedRuntimeConfig.mail;
// => { token: 'mail-token' }
```

## Example: environment variables

Adapters choose their own prefix. The default prefix is deliberately generic.

```ts
import {
  projectRuntimeConfigEnvVars,
  runtimeEnvVarsToShellAssignments,
  runtimeEnvVarsToString,
  toRuntimeEnvVars,
} from '@lorion-org/runtime-config';

const envVars = toRuntimeEnvVars(
  {
    public: {
      billingApiBase: '/api/billing',
    },
    private: {
      billingApiSecret: 'secret',
    },
  },
  'APP',
);

runtimeEnvVarsToString(envVars);
// => APP_PUBLIC_BILLING_API_BASE=/api/billing
// => APP_PRIVATE_BILLING_API_SECRET=secret

runtimeEnvVarsToShellAssignments(envVars);
// => APP_PUBLIC_BILLING_API_BASE='"/api/billing"'
// => APP_PRIVATE_BILLING_API_SECRET='"secret"'

projectRuntimeConfigEnvVars(
  new Map([
    [
      'billing',
      {
        public: {
          apiBase: '/api/billing',
        },
      },
    ],
  ]),
  {
    prefix: 'APP',
  },
);
// => {
//   APP_PUBLIC_BILLING_API_BASE: '/api/billing'
// }
```

Runnable example files live in [`examples/`](./examples).

## Local commands

```shell
cd packages/runtime-config
pnpm build
pnpm test
pnpm coverage
pnpm typecheck
pnpm package:check
```
