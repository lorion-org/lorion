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

Host configs that import selection helpers from `@lorion-org/composition-graph`
should declare that package directly too.

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

Grouping descriptors are resolved but never registered as layers: a grouping owns no
directory, so it is addressed at a synthetic path and cannot contribute another
extension's app, config or server folders.

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

Descriptors can also declare provider candidates with `providesFor`. The shared
descriptor selection resolves every active provider slot and requires a winner
only when a resolved descriptor depends on that capability. The module exposes
selected and unfilled slots in public runtime config as `providerSelection`.

## Package shape

```text
src/
  extensions.ts
  index.ts
  module.ts
  runtime-config.ts
  runtime-config-node.ts
  types.ts
snippets/
  read-runtime-config.server.ts
  runtime-config-source.nuxt.config.ts
  selected-extensions.nuxt.config.ts
test/
  fixtures/
  unit/
```

- `src/module.ts` contains Nuxt module wiring: selected layer registration, provider selection, runtime-config loading, and auto-imports.
- `src/extensions.ts` contains descriptor discovery, selection, bootstrap, and extension-owned runtime config.
- `src/runtime-config.ts` contains universal runtime-config adapter helpers.
- `src/runtime-config-node.ts` contains Node-only source loading helpers.
- The published package exports the root Nuxt module, runtime-config subpaths, the descriptor schema, and runtime-safe extension helpers under `@lorion-org/nuxt/extensions`. Runtime-config composables are generated and auto-imported by the module.
- `snippets/` contains Nuxt-focused config and server-route snippets.
- The runnable Nuxt example app lives at `examples/nuxt` in the repo root.
- `test/fixtures/` contains Nuxt applications used by end-to-end tests, and `test/unit/` contains package unit tests.
- The `srvx` devDependency is load-bearing for development only: it aligns this package's dev-time `nuxt` peer context with the standalone `examples/nuxt` app (which pulls `srvx` transitively through the Nitro server). Without it, pnpm resolves `nuxt` into two peer contexts and the `nuxt/schema` module augmentation in `src/types.ts` no longer typechecks. It is not imported by any source file — do not remove it as "unused". The root `package.json` `pnpm.overrides` pins `srvx` to one version workspace-wide so this alignment cannot silently drift when Nitro bumps its own `srvx` range; bump both together if Nitro ever requires a newer `srvx`.

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
        checkout: {
          public: {
            successPath: '/orders/confirmed',
          },
          private: {
            signingSecret: 'checkout_signing_secret_demo',
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

The module also auto-imports runtime-config composables when
`runtimeConfig.imports` is `true`, or when it is omitted and the host Nuxt app
keeps import scanning enabled. Hosts that set `imports.scan: false` can import
the generated composables explicitly instead:

```ts
import { usePublicRuntimeConfigScope } from '#build/lorion/runtime-config-composables';

const checkout = usePublicRuntimeConfigScope('checkout');

checkout.successPath;
// => '/orders/confirmed'
```

Nitro server plugins can import from
`#internal/lorion-runtime-config-composables.mjs`.

Configured module options such as `contextOutputKey` and `privateOutput` are
used by these composables automatically.

The public package API is intentionally small: resolve extension descriptors in
`nuxt.config`, pass Nuxt-native layer paths to `extends`, then register the
module with the resolved bootstrap for runtime config, provider selection, and
file-only layer content.

### Extension options

`lorion.extensions` accepts every option `CapabilitySelectionInput` declares, in the
core's spelling, so the same composition is expressible here and in the React
loader: `capabilitiesDir`, `descriptorPaths`, `descriptorSchema`,
`virtualDescriptors`, `bundles`, `nestedField`, `relationDescriptors`, `policy`, and
the seed fields `baseDescriptors`, `defaultSelection`, `selected` and
`selectionSeed`. Each takes a list where the core takes a list. `enabled: false`
turns the composition off, which a statically declared Nuxt module needs and a Vite
plugin expresses by not being added.

A grouping — declared in a `bundles.json`, passed as a `virtualDescriptor`, or
nested in another descriptor under `nestedField` — resolves in the graph and
registers no layer, whatever its host's directory holds.

Descriptor files are validated before they are normalized. The module uses the
shared LORION descriptor schema by default, the same one every host validates
against, so a core field such as `bundles`, `runtimeConfig`
or `publicRuntimeConfig` is described in one place. Host apps with additional
descriptor metadata can import the schema, extend it locally, and pass the result
through `extensions.descriptorSchema`:

```ts
import { descriptorSchema } from '@lorion-org/nuxt/descriptor-schema';
import LorionNuxtModule, {
  createNuxtExtensionBootstrap,
  createNuxtExtensionLayerPaths,
} from '@lorion-org/nuxt';

const extensionBootstrap = createNuxtExtensionBootstrap({
  rootDir: __dirname,
  options: {
    descriptorSchema: {
      ...descriptorSchema,
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
    selected: ['admin'],
  },
});

export default defineNuxtConfig({
  extends: createNuxtExtensionLayerPaths(extensionBootstrap),
  modules: [[LorionNuxtModule, { extensionBootstrap }]],
});
```

Applications that want CLI or env driven selection can use the shared
capability seed directly. By default the Nuxt bootstrap reads `--capabilities`,
`npm_config_capabilities`, and `LORION_CAPABILITIES` before falling back to
`defaultSelection`.

```ts
const extensionBootstrap = createNuxtExtensionBootstrap({
  rootDir: __dirname,
  options: {
    defaultSelection: ['default'],
  },
});
```

No `selectionSeed.key` option is required for the default capability seed. Pass
`selectionSeed` only when the host needs to override the seed names, inject
custom `argv`/`env` for tests, or set `selectionSeed: false` to disable CLI/env
lookup.

The LORION bootstrap receives canonical selection ids and resolves the graph.

## Provider Selection

Provider extensions can declare the capability they implement:

```json
{
  "id": "payment-provider-stripe",
  "version": "1.0.0",
  "providesFor": "checkout",
  "defaultFor": "checkout"
}
```

`providesFor` and `defaultFor` both accept a string or string array. Use
`defaultFor` when the provider package owns the normal/default provider choice.
If a descriptor exists for that capability, the Nuxt bootstrap also treats
`defaultFor` as a composition relation from the capability to the provider.

The module writes the shared `providerSelection` result unchanged: a sorted
`slots` array containing selected or unfilled slots plus `excludedProviderIds`.
A descriptor selects a provider by depending on it alongside the capability it
requires:

```json
{
  "id": "web",
  "version": "1.0.0",
  "dependencies": {
    "checkout": "^1.0.0",
    "payment-provider-invoice": "^1.0.0"
  }
}
```

If a provider descriptor is an explicit composition root, that provider wins for
its capability over descriptor dependencies and `defaultFor`. A descriptor
dependency wins over `defaultFor`. Distinct providers named at the same tier fail
fast instead of being chosen by discovery order. Provider roots from the resolved
extension selection and `extensions.baseDescriptors` belong to the `explicit`
tier. Provider reports and public runtime config forward the provenance contract
owned by `@lorion-org/provider-selection` unchanged. The removed
`providerPreferences` field is rejected; migrate the choice to the descriptor's
`dependencies` map.

## Runtime Config

Runtime-config projection does not require extension discovery. It can be used
as a plain module option when no extension bootstrap is involved:

```ts
export default defineNuxtConfig({
  modules: ['@lorion-org/nuxt'],
  lorion: {
    runtimeConfig: {
      fragments: {
        checkout: {
          public: {
            successPath: '/orders/confirmed',
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
    checkout/
      runtime.config.json
```

Adapters with an existing context key can map that key without changing file
contents:

```ts
export default defineNuxtConfig({
  modules: ['@lorion-org/nuxt'],
  lorion: {
    runtimeConfig: {
      contextInputKey: 'stores',
      contextOutputKey: '__stores',
      source: {
        paths: ['var/runtime-config/*/runtime.config.json'],
      },
    },
  },
});
```

Nuxt-focused snippets live in [`snippets/`](./snippets):

- [`selected-extensions.nuxt.config.ts`](./snippets/selected-extensions.nuxt.config.ts)
- [`runtime-config-source.nuxt.config.ts`](./snippets/runtime-config-source.nuxt.config.ts)
- [`read-runtime-config.server.ts`](./snippets/read-runtime-config.server.ts)

## Example app

The runnable Nuxt example lives at `examples/nuxt` (repo root). Run it from the
workspace root:

```shell
pnpm --filter @lorion-examples/nuxt dev
```

It runs with Lorion's `lorion-source` export condition so workspace imports
resolve to `src` instead of stale `dist` output. Select a composition through the
seed CLI or environment:

```shell
pnpm --filter @lorion-examples/nuxt dev -- --capabilities=web,payment-provider-invoice
LORION_CAPABILITIES="web payment-provider-invoice" pnpm --filter @lorion-examples/nuxt dev
```

The example app uses the module with no manual extension list in `nuxt.config.ts`.
It configures only the presentation-specific descriptor paths, loads runtime
config from `.runtimeconfig`, and registers the selected extension profile as
Nuxt layers.

The example app intentionally overrides the default extension root to make the
demo concept visible:

```ts
import LorionNuxtModule, {
  createNuxtExtensionBootstrap,
  createNuxtExtensionLayerPaths,
} from '@lorion-org/nuxt';

const extensionBootstrap = createNuxtExtensionBootstrap({
  rootDir: __dirname,
  options: {
    // The groupings live in a manifest the host points at; `default` is one of them.
    bundles: { cwd: __dirname },
    defaultSelection: ['default'],
    descriptorPaths: ['layer-extensions/*/extension.json'],
  },
});

export default defineNuxtConfig({
  extends: createNuxtExtensionLayerPaths(extensionBootstrap),
  modules: [[LorionNuxtModule, { extensionBootstrap, logging: true }]],
});
```

The example app shape is:

```text
examples/nuxt/
  app/
  bundles.json
  layer-extensions/
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

The root app lives under `examples/nuxt/app`. It owns normal Nuxt application
code. The `shops` layer extension provides the shop home route at `/`, the tiny
Registry Hub plugin backed by `@lorion-org/registry-hub`, and the shop registry
item type. Shop extensions depend on `shops`, register small shop entries
through that registry, and contribute their own pages, plugins, and server
routes. The `admin` layer extension provides the admin home route at
`/` for admin profiles. The technical integration monitor lives at `/tech`.

The default profile points to a neutral `web` profile. It starts the shop home
with Stripe as the checkout provider because the Stripe provider descriptor
declares `defaultFor: "checkout"`. Selecting `web payment-provider-invoice`
overrides that default and leaves Stripe out of the resolved graph. `admin`
starts the admin home without loading the shop or payment-provider extensions.

To run variants side by side, select the seed on the CLI and pass different
Nuxt ports:

```shell
pnpm --filter @lorion-examples/nuxt dev -- --port 3037
pnpm --filter @lorion-examples/nuxt dev -- --port 3039
pnpm --filter @lorion-examples/nuxt dev -- --capabilities=admin --port 3041
pnpm --filter @lorion-examples/nuxt dev -- --capabilities=web,payment-provider-invoice --port 3043
```

Each extension contributes only the Nuxt layer content it needs. The module
registers selected extensions as Nuxt layers; the example app does not list them
in `nuxt.config.ts`.
Provider extensions contribute checkout pages, register a small checkout
provider implementation through the payments layer interface, and expose server
routes. They declare `providesFor: "checkout"`; the `web` bundle selects Stripe
through a dependency, and Stripe also declares `defaultFor: "checkout"` for
compositions that name no provider. Selecting Invoice in the seed overrides both.
Runtime config for checkout, payments, and providers is loaded from
`.runtimeconfig/runtime-config/<scope>/runtime.config.json`.

The module also exposes a public `extensionSelection` runtime-config object with
the selected profile, resolved descriptors, and active layer extension ids. The
module exposes the shared public `providerSelection` result with selected and
unfilled slots, candidates, requirement state, selection mode, and excluded
providers. The example app reads it on `/tech`; its demo API returns the same
projection from `/api/demo/overview`.

Demo extensions:

- `shop-coffee`
- `shop-stationery`
- `shops`
- `checkout`
- `payments`
- `admin`
- `payment-provider-stripe`
- `payment-provider-invoice`

The example app also shows how the wider package set can work together:

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
- typechecked TypeScript snippets through the workspace snippets check

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
pnpm package:check
```
