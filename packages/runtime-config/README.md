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
contexts with `contextInputKey`. For example, a project can read `stores`
from its files while this package still works with the generic `contexts`
model internally.

## The three runtime-config shapes

This package separates the local config shape from the runtime transport shape.

### 1. Fragment shape

Fragments are written in local scope vocabulary. The scope id is not repeated in
the keys.

```ts
const checkoutFragment = {
  public: {
    currency: 'EUR',
    successPath: '/orders/confirmed',
  },
  private: {
    signingSecret: 'checkout_signing_secret_demo',
  },
};
```

This is the shape that JSON files and schemas usually describe.

### 2. Flat runtime shape

Some runtimes need one shared `public` and `private` object. The scope id becomes
a transport prefix so many fragments can coexist without key collisions.

```ts
const runtimeConfig = projectSectionedRuntimeConfig(new Map([['checkout', checkoutFragment]]));

// For a single fragment, use:
projectRuntimeConfigFragment('checkout', checkoutFragment);

runtimeConfig.public.checkoutCurrency;
// => 'EUR'
runtimeConfig.private.checkoutSigningSecret;
// => 'checkout_signing_secret_demo'
```

### 3. Environment variable shape

Environment variables keep the same transport prefix and add visibility.

```ts
toRuntimeEnvVars(runtimeConfig, 'APP');
// => {
//   APP_PUBLIC_CHECKOUT_CURRENCY: 'EUR',
//   APP_PUBLIC_CHECKOUT_SUCCESS_PATH: '/orders/confirmed',
//   APP_PRIVATE_CHECKOUT_SIGNING_SECRET: 'checkout_signing_secret_demo'
// }
```

Usage code can read the flat runtime shape back through local keys:

```ts
const checkout = getPublicRuntimeConfigScope(runtimeConfig, 'checkout');

checkout.successPath;
// => '/orders/confirmed'
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
    'checkout',
    {
      public: {
        successPath: '/orders/confirmed',
      },
      private: {
        signingSecret: 'checkout_signing_secret_demo',
      },
      contexts: {
        'eu-store': {
          public: {
            successPath: '/eu-store/orders/confirmed',
          },
        },
      },
    },
  ],
]);

const runtimeConfig = projectSectionedRuntimeConfig(fragments);

runtimeConfig.public.checkoutSuccessPath;
// => '/orders/confirmed'

resolveRuntimeConfigValue(runtimeConfig.public, 'checkout', 'successPath', {
  contextId: 'eu-store',
});
// => '/eu-store/orders/confirmed'

getPublicRuntimeConfigScope(runtimeConfig, 'checkout');
// => { successPath: '/orders/confirmed' }
```

## Example: custom context input key

```ts
import { projectSectionedRuntimeConfig } from '@lorion-org/runtime-config';

projectSectionedRuntimeConfig(
  [
    {
      scopeId: 'checkout',
      config: {
        public: {
          successPath: '/orders/confirmed',
        },
        stores: {
          'eu-store': {
            public: {
              successPath: '/eu-store/orders/confirmed',
            },
          },
        },
      },
    },
  ],
  {
    contextInputKey: 'stores',
    contextOutputKey: '__stores',
  },
);
// => {
//   public: {
//     checkoutSuccessPath: '/orders/confirmed',
//     __stores: {
//       'eu-store': {
//         checkoutSuccessPath: '/eu-store/orders/confirmed'
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

const runtimeConfig = projectRuntimeConfigNamespace('checkout', {
  public: {
    successPath: '/orders/confirmed',
  },
  private: {
    signingSecret: 'checkout_signing_secret_demo',
  },
});

runtimeConfig.public.checkout;
// => { successPath: '/orders/confirmed' }
runtimeConfig.checkout;
// => { signingSecret: 'checkout_signing_secret_demo' }

const combinedRuntimeConfig = projectRuntimeConfigNamespaces([
  {
    scopeId: 'payments',
    config: {
      public: {
        configuredProvider: 'payment-provider-stripe',
      },
    },
  },
]);

combinedRuntimeConfig.public.payments;
// => { configuredProvider: 'payment-provider-stripe' }
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
      checkoutSuccessPath: '/orders/confirmed',
    },
    private: {
      checkoutSigningSecret: 'checkout_signing_secret_demo',
    },
  },
  'APP',
);

runtimeEnvVarsToString(envVars);
// => APP_PUBLIC_CHECKOUT_SUCCESS_PATH=/orders/confirmed
// => APP_PRIVATE_CHECKOUT_SIGNING_SECRET=checkout_signing_secret_demo

runtimeEnvVarsToShellAssignments(envVars);
// => APP_PUBLIC_CHECKOUT_SUCCESS_PATH='"/orders/confirmed"'
// => APP_PRIVATE_CHECKOUT_SIGNING_SECRET='"checkout_signing_secret_demo"'

projectRuntimeConfigEnvVars(
  new Map([
    [
      'payments',
      {
        public: {
          configuredProvider: 'payment-provider-stripe',
        },
      },
    ],
  ]),
  {
    prefix: 'APP',
  },
);
// => {
//   APP_PUBLIC_PAYMENTS_CONFIGURED_PROVIDER: 'payment-provider-stripe'
// }
```

Runnable example files live in [`snippets/`](./snippets).

## Local commands

```shell
cd packages/runtime-config
pnpm build
pnpm test
pnpm coverage
pnpm typecheck
pnpm package:check
```
