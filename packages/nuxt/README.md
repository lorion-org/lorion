# @lorion-org/nuxt

Nuxt 4 adapter for LORION, the Layer Orchestration Runtime for Node.js.

`@lorion-org/nuxt` lets a Nuxt application activate descriptor-selected layers
without hardcoding every deployment profile in `nuxt.config.ts`. It resolves a
LORION extension bootstrap, passes Nuxt-native layer paths to `extends`, mounts
file-only layer content, projects scoped runtime config into Nuxt
`runtimeConfig`, and exposes provider selection for active capability
candidates.

Use it when Nuxt is the host runtime, but the application shape belongs to
explicit layer descriptors: product editions, customer deployments, white-label
variants, optional providers, or profile-based feature sets.

## Install

```shell
pnpm add @lorion-org/nuxt
```

## What it is

- a Nuxt 4 adapter for LORION layer orchestration
- descriptor/profile resolution for selectable Nuxt layer compositions
- Nuxt layer activation through native `extends` plus module-mounted file-only layers
- runtime-config projection from scoped LORION fragments into Nuxt `runtimeConfig`
- auto-imported public/private scope-view helpers for `useRuntimeConfig()` results
- provider selection for descriptors that declare `providesFor`

## Why not just Nuxt layers?

Nuxt layers are the right default when an application can statically list the
layers it uses. `@lorion-org/nuxt` is for Nuxt 4 applications where the layer list is
itself a runtime architecture concern and should be selected from explicit
descriptors or profiles.

Use Nuxt layers directly when:

- the layer list is known at development time
- every deployment uses the same layer composition
- runtime config can live directly in `nuxt.config.ts`

Use `@lorion-org/nuxt` when:

- different deployments or profiles activate different layer sets
- extension descriptors should define selectable compositions
- runtime config fragments should stay local to each extension
- provider implementations should be selected from active layer candidates
- Nuxt should receive collision-safe projected runtime config keys

## What it is not

- not a schema validator
- not an application naming policy

## Compatibility

| Package version | Nuxt 3            | Nuxt 4    | Test status                        |
| --------------- | ----------------- | --------- | ---------------------------------- |
| `0.1.x`         | not supported yet | supported | CI-tested locally against Nuxt 4.x |

## Extension model

The module uses one `lorion` config key. By default it discovers `extension.json`
files below `extensions/`, expands nested descriptors from the `bundles`
field, resolves the selected profile through `@lorion-org/composition-graph`,
and registers only resolved extensions that contain Nuxt layer content.

Layer content includes:

- `app`
- `modules`
- `public`
- `server`
- `shared`
- `nuxt.config.*`

The module adds selected extensions to Nuxt's layer list so Nuxt owns page,
component, composable, layout, middleware, plugin, shared, server, and other
layer scans. The module does not hand-build Nuxt routes or register individual
component, plugin, page, or server directories.

Profile-only descriptors, such as `extensions/bundles/extension.json`,
are resolved but not registered as layers because they do not contain Nuxt layer
content.

Resolved extension ids currently come from `@lorion-org/composition-graph` and
are deterministic, but the dependency graph is a selection mechanism rather
than a documented plugin execution-order guarantee. Extension plugins that need
Nuxt ordering should use Nuxt plugin ordering controls such as `enforce` until
the module exposes an explicit dependency-ordered layer contract.

Runtime config can be provided as inline fragments, as an already projected
runtime config object, or as a configured source directory. When a project has
`.runtimeconfig/runtime-config`, the module loads it with the default
runtime-config file conventions only when `lorion.runtimeConfig` is omitted. Set
`lorion.runtimeConfig.source` for an explicit source directory, or set
`lorion.runtimeConfig.enabled` to `false` to disable runtime-config loading.
Runtime config stays separate from extension descriptors.

Descriptors can also declare provider candidates with `providesFor`. After the
selected profile is resolved, the module uses `@lorion-org/provider-selection`
to choose one provider per capability and exposes the result in public runtime
config as `providerSelection`.

## Package shape

```text
src/
  extensions.ts
  index.ts
  module.ts
  runtime-config.ts
  runtime-config-node.ts
  types.ts
examples/
  read-runtime-config.server.ts
  runtime-config-source.nuxt.config.ts
  selected-extensions.nuxt.config.ts
playground/
test/
  fixtures/
  unit/
```

- `src/module.ts` contains Nuxt module wiring: selected layer registration, provider selection, runtime-config loading, and auto-imports.
- `src/extensions.ts` contains descriptor discovery, selection, bootstrap, and extension-owned runtime config.
- `src/runtime-config.ts` contains universal runtime-config adapter helpers.
- `src/runtime-config-node.ts` contains Node-only source loading helpers.
- The published package exports only the root Nuxt module. Runtime-config composables are generated and auto-imported by the module.
- `examples/` contains Nuxt-focused config and server-route snippets.
- `playground/` is a runnable Nuxt app for manual module development.
- `test/fixtures/` contains Nuxt applications used by end-to-end tests, and `test/unit/` contains package unit tests.

## Nuxt module

A minimal Nuxt app only needs the module:

```ts
export default defineNuxtConfig({
  modules: ['@lorion-org/nuxt'],
});
```

With that setup the module looks for this default layout:

```text
extensions/
  bundles/
    extension.json
  checkout/
    extension.json
    app/
    server/
.runtimeconfig/
  runtime-config/
    checkout/
      runtime.config.json
```

Inline runtime config is supported for static defaults, local examples, and
tests. Runtime and environment-specific values should live outside
`nuxt.config.ts`, for example in `.runtimeconfig/runtime-config`:

```ts
export default defineNuxtConfig({
  modules: ['@lorion-org/nuxt'],
  lorion: {
    runtimeConfig: {
      fragments: {
        billing: {
          public: {
            apiBase: '/api/billing',
          },
          private: {
            apiSecret: 'secret',
          },
        },
      },
    },
  },
});
```

For inline fragments, the module writes private values to the root Nuxt runtime
config object and public values below `runtimeConfig.public`. Set
`privateOutput: 'section'` when the target runtime should keep private values
below `runtimeConfig.private`.

The module also auto-imports runtime-config composables unless
`runtimeConfig.imports` is `false`.

```ts
const billing = usePublicRuntimeConfigScope('billing');

billing.apiBase;
// => '/api/billing'
```

Configured module options such as `contextOutputKey` and `privateOutput` are
used by these composables automatically.

The public package API is intentionally small: resolve extension descriptors in
`nuxt.config`, pass Nuxt-native layer paths to `extends`, then register the
module with the resolved bootstrap for runtime config, provider selection, and
file-only layer content.

Descriptor files are validated before they are normalized. The module uses its
LORION extension descriptor schema by default. Host apps with additional descriptor
metadata can import the schema, extend it locally, and pass the result through
`extensions.descriptorSchema`:

```ts
import { nuxtExtensionDescriptorSchema } from '@lorion-org/nuxt/descriptor-schema';
import LorionNuxtModule, {
  createNuxtExtensionBootstrap,
  createNuxtExtensionLayerPaths,
} from '@lorion-org/nuxt';

const extensionBootstrap = createNuxtExtensionBootstrap({
  rootDir: __dirname,
  options: {
    descriptorSchema: {
      ...nuxtExtensionDescriptorSchema,
      // host-specific schema extension
    },
  },
});

export default defineNuxtConfig({
  extends: createNuxtExtensionLayerPaths(extensionBootstrap),
  modules: [[LorionNuxtModule, { extensionBootstrap }]],
});
```

## Extension profiles

```ts
import LorionNuxtModule, {
  createNuxtExtensionBootstrap,
  createNuxtExtensionLayerPaths,
} from '@lorion-org/nuxt';

const extensionBootstrap = createNuxtExtensionBootstrap({
  rootDir: __dirname,
});

export default defineNuxtConfig({
  extends: createNuxtExtensionLayerPaths(extensionBootstrap),
  modules: [[LorionNuxtModule, { extensionBootstrap }]],
});
```

The default descriptor path is `extensions/*/extension.json`. A profile is a
normal descriptor that depends on other descriptors. The bootstrap selects
`default` when nothing is configured. Descriptors with their own `nuxt.config`
are returned as native `extends`; file-only descriptors are mounted by the
module after Nuxt config loading.

```json
{
  "id": "bundles",
  "version": "1.0.0",
  "bundles": [
    {
      "id": "default",
      "version": "1.0.0",
      "dependencies": {
        "web": "^1.0.0"
      }
    }
  ]
}
```

Extension descriptors should stay focused on composition data: `id`, `version`,
dependencies, nested `bundles`, `providesFor` for provider candidates, provider
preferences on profiles, and public runtime config when the extension needs to
expose browser-safe values. Nuxt routes, components, composables, plugins, and
server handlers come from Nuxt layer scanning, not from duplicated descriptor
metadata.

Override the selected profile with module config:

```ts
import LorionNuxtModule, {
  createNuxtExtensionBootstrap,
  createNuxtExtensionLayerPaths,
} from '@lorion-org/nuxt';

const extensionBootstrap = createNuxtExtensionBootstrap({
  rootDir: __dirname,
  options: {
    selected: 'admin',
  },
});

export default defineNuxtConfig({
  extends: createNuxtExtensionLayerPaths(extensionBootstrap),
  modules: [[LorionNuxtModule, { extensionBootstrap }]],
});
```

Applications that want CLI or env driven selection should normalize those
inputs locally and pass the resulting seed ids through `options.selected`.
The LORION bootstrap only receives canonical selection ids and resolves the graph.

## Provider Selection

Provider extensions can declare the capability they implement:

```json
{
  "id": "payment-provider-stripe",
  "version": "1.0.0",
  "providesFor": "payment-checkout"
}
```

The module writes a public `providerSelection` object with selected providers,
candidates, excluded providers, configured providers, and mismatches. Profiles
can declare provider preferences in descriptor metadata:

```json
{
  "id": "checkout-profile",
  "version": "1.0.0",
  "providerPreferences": {
    "payment-checkout": "payment-provider-invoice"
  }
}
```

Module options can still override the selected provider when a host app needs a
deployment-specific choice:

```ts
export default defineNuxtConfig({
  extends: createNuxtExtensionLayerPaths(extensionBootstrap),
  modules: [
    [
      LorionNuxtModule,
      {
        extensionBootstrap,
        providers: {
          configuredProviders: {
            'payment-checkout': 'payment-provider-invoice',
          },
        },
      },
    ],
  ],
});
```

## Runtime Config

Runtime-config projection does not require extension discovery. It can be used
as a plain module option when no extension bootstrap is involved:

```ts
export default defineNuxtConfig({
  modules: ['@lorion-org/nuxt'],
  lorion: {
    runtimeConfig: {
      fragments: {
        billing: {
          public: {
            apiBase: '/api/billing',
          },
        },
      },
    },
  },
});
```

## Runtime Config Source

The module can load runtime-config fragments from path patterns. Pattern
discovery and schema validation are delegated to
`@lorion-org/runtime-config-node`; this package only projects the loaded
fragments into Nuxt `runtimeConfig`. The default is
`.runtimeconfig/runtime-config/*/runtime.config.json`.

```ts
export default defineNuxtConfig({
  modules: ['@lorion-org/nuxt'],
  lorion: {
    runtimeConfig: {
      source: {
        paths: ['.runtimeconfig/runtime-config/*/runtime.config.json'],
      },
    },
  },
});
```

Directory shape:

```text
var/
  runtime-config/
    billing/
      runtime.config.json
```

Adapters with an existing context key can map that key without changing file
contents:

```ts
export default defineNuxtConfig({
  modules: ['@lorion-org/nuxt'],
  lorion: {
    runtimeConfig: {
      contextInputKey: 'tenants',
      contextOutputKey: '__tenants',
      source: {
        paths: ['var/runtime-config/*/runtime.config.json'],
      },
    },
  },
});
```

Nuxt-focused example snippets live in [`examples/`](./examples):

- [`selected-extensions.nuxt.config.ts`](./examples/selected-extensions.nuxt.config.ts)
- [`runtime-config-source.nuxt.config.ts`](./examples/runtime-config-source.nuxt.config.ts)
- [`read-runtime-config.server.ts`](./examples/read-runtime-config.server.ts)

## Playground

Run the local playground from this package:

```shell
pnpm dev:playground
```

Select a playground composition by passing `extensions.selected` in Nuxt config:

The playground uses the module with no manual extension list in `nuxt.config.ts`.
It configures only the presentation-specific descriptor paths, loads runtime
config from `.runtimeconfig`, and registers the selected extension profile as
Nuxt layers.

The playground intentionally overrides the default extension root to make the
demo concept visible:

```ts
import LorionNuxtModule from '../src/module';

export default defineNuxtConfig({
  modules: [LorionNuxtModule],
  lorion: {
    extensions: {
      defaultSelection: 'default',
      descriptorPaths: ['layer-extensions/*/extension.json'],
      selected: 'default',
    },
    providers: {
      configuredProviders: {
        'payment-checkout': 'payment-provider-stripe',
      },
    },
  },
});
```

The playground shape is:

```text
playground/
  app/
  layer-extensions/
    bundles/
      extension.json
    checkout/
    payments/
    shops/
    shop-coffee/
    shop-stationery/
    admin/
    payment-provider-stripe/
    payment-provider-invoice/
  .runtimeconfig/
    runtime-config/
```

The root app lives under `playground/app`. It owns normal Nuxt application
code. The `shops` layer extension provides the shop home route at `/`, the tiny
Registry Hub plugin backed by `@lorion-org/registry-hub`, and the shop registry
item type. Shop extensions depend on `shops`, register small shop entries
through that registry, and contribute their own pages, plugins, and server
routes. The `admin` layer extension provides the admin home route at
`/` for admin profiles. The technical integration monitor lives at `/tech`.

The default profile points to a neutral `web` profile. It starts the shop home
with both payment-provider extensions mounted as candidates. The playground
config selects Stripe through `lorion.providers.configuredProviders`, and
`@lorion-org/provider-selection` publishes the selected provider. `admin` starts
the admin home without loading the shop or payment-provider extensions.

To run variants side by side, select the profile in playground config and pass
different Nuxt ports:

```shell
pnpm dev:playground -- --port 3037
pnpm dev:playground -- --port 3039
```

Each extension contributes only the Nuxt layer content it needs. The module
registers selected extensions as Nuxt layers; the playground does not list them
in `nuxt.config.ts`.
Provider extensions contribute checkout pages, register a small checkout
provider implementation through the payments layer interface, and expose server
routes. They declare `providesFor: "payment-checkout"`, while the Nuxt module
options provide the selected preference. Runtime config for checkout, payments,
and providers is loaded from
`.runtimeconfig/runtime-config/<scope>/runtime.config.json`.

The module also exposes a public `extensionSelection` runtime-config object with
the selected profile, resolved descriptors, and active layer extension ids. The
module exposes a public `providerSelection` object with the selected provider,
candidate providers, selection mode, and excluded providers. The playground reads
those objects on `/tech` and its demo API returns a minimal view of them from
`/api/demo/overview`.

Demo extensions:

- `shop-coffee`
- `shop-stationery`
- `shops`
- `checkout`
- `payments`
- `admin`
- `payment-provider-stripe`
- `payment-provider-invoice`

The playground also shows how the wider package set can work together:

- `@lorion-org/descriptor-discovery` discovers `extension.json` files.
- `@lorion-org/composition-graph` resolves selected profiles to active extensions.
- `@lorion-org/provider-selection` selects one payment provider from the active provider candidates.
- `@lorion-org/registry-hub` lets extensions register the small UI entries rendered by the root app.
- `@lorion-org/runtime-config-node` loads runtime config fragments from disk.

The pages read public runtime config in the browser. The server API only returns
minimal booleans that prove private runtime config is available server-side
without returning secret values to the client.

## Testing

The package has three test groups:

- unit tests for the adapter helpers and explicit extension activation
- an end-to-end Nuxt fixture that starts a real Nuxt app with the module
- typechecked TypeScript examples through the workspace examples check

The e2e fixture verifies that `lorion.runtimeConfig` writes values into Nuxt
runtime config, that a server route can read them back through
`getPublicNuxtRuntimeConfigScope()`, and that the module auto-imports configured
runtime-config composables.

## Local commands

```shell
cd packages/nuxt
pnpm build
pnpm test
pnpm test:unit
pnpm test:e2e
pnpm typecheck
pnpm typecheck:playground
pnpm build:playground
pnpm package:check
```
