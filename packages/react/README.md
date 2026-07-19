# @lorion-org/react

[![npm](https://img.shields.io/npm/v/@lorion-org/react)](https://www.npmjs.com/package/@lorion-org/react)
[![CI](https://github.com/lorion-org/lorion/actions/workflows/ci.yml/badge.svg)](https://github.com/lorion-org/lorion/actions/workflows/ci.yml)

React capability runtime and Vite helpers for LORION descriptor-based applications.

Use this package when a React application is assembled from local capability
packages that each expose a `capability.json` descriptor. It supports two
deliberate consumption models over the same LORION discovery and composition
graph, and both are first-class: pick one per product (see Two Composition
Models).

## Install

```shell
pnpm add @lorion-org/react react
```

Host configs that import selection helpers from `@lorion-org/composition-graph`
should declare that package directly too.

Add Vite, TanStack Router, or another router in the host application as needed.
The runtime helpers do not own routing; the Vite entry point only prepares
capability discovery and TanStack-compatible virtual route config.

## Quick start

Add the Vite capability loader, then consume the resolved capabilities with your
own runtime (this is the loader-only path, Model B):

```ts
// vite.config.ts
import { capabilityLoader } from '@lorion-org/react/vite';

export default defineConfig({
  plugins: [capabilityLoader({ workspaceRoot: import.meta.dirname })],
});
```

```ts
// main.ts
import { capabilityModules } from 'virtual:capabilities';
// register the pre-resolved capabilities with your own plugin runtime
```

For a batteries-included React runtime and file-based routing instead, use
`lorionReact()` (Model A). Both are described under Two Composition Models.

## What It Is

- a small React binding for immutable capability contributions
- a Vite virtual module helper for active capability activation exports
- a TanStack virtual route config helper for capability-owned route folders
- scoped public runtime config for active capabilities
- a React adapter over LORION descriptor discovery and composition graph packages

## What It Is Not

- not a UI component library
- not a router
- not a package manager
- not an application naming convention

## Two Composition Models

Both models build on the same LORION discovery, composition graph, provider
selection, and `virtual:capabilities` build output. They differ only in how much
of the React side the host delegates to this package. Neither is a special case;
choose one per product.

### Model A: React capability runtime and routing

`lorionReact()` wires the Vite capability loader, the React capability runtime
(`createCapabilityRuntime`), and TanStack file-based route composition together.
Capabilities activate through the `./capability` convention and own route
folders. Use this when the product wants a batteries-included React runtime and
file-based routing from LORION.

### Model B: capability loader with your own runtime

`capabilityLoader()` on its own resolves the descriptor graph at build time and
emits `virtual:capabilities`; the host consumes that pre-resolved module list
with its own plugin registry, its own routing, and its own lifecycle. Nothing
from the React runtime or route config is required. Capabilities activate through
an explicit `activation` resolver against their existing package exports, and
dependency-only libraries stay graph-only. Use this when the product already owns
a plugin system, or when one package set ships as several product distributions,
and only needs LORION for selection and activation.

|               | Model A                                  | Model B                                              |
| ------------- | ---------------------------------------- | ---------------------------------------------------- |
| Vite entry    | `lorionReact()`                          | `capabilityLoader()`                                 |
| React runtime | `createCapabilityRuntime` (this package) | host-owned                                           |
| Routing       | TanStack file-based via `routeConfig`    | host-owned (for example code-based)                  |
| Activation    | `./capability` convention                | explicit `activation` resolver, graph-only otherwise |
| Host consumes | provider and contribution contracts      | `capabilityModules` from `virtual:capabilities`      |

## React Capability Runtime (Model A)

```ts
import { CapabilityRuntimeProvider, createCapabilityRuntime } from '@lorion-org/react';
import { capabilityModules } from 'virtual:capabilities';

const capabilityRuntime = createCapabilityRuntime(capabilityModules);
```

Render the provider once around the application tree:

```tsx
import { CapabilityRuntimeProvider } from '@lorion-org/react';

root.render(
  <CapabilityRuntimeProvider runtime={capabilityRuntime}>
    <App />
  </CapabilityRuntimeProvider>,
);
```

Capability contracts can define extension points and read contributions:

```ts
import { createContributionContract } from '@lorion-org/react';

type Tool = {
  id: string;
  label: string;
};

const toolContract = createContributionContract<Tool>('tools');

export function defineTools(tools: readonly Tool[]) {
  return toolContract.define(tools);
}

export function useTools(): Tool[] {
  return toolContract.use();
}
```

## Capability Packages

Each local capability package needs a descriptor and an activation export:

```text
capabilities/
  my-capability/
    capability.json
    package.json
    src/
      capability.ts
      routes/
        index.tsx
```

```json
{
  "id": "my-capability",
  "version": "1.0.0",
  "dependencies": {
    "other-capability": "^1.0.0"
  }
}
```

```json
{
  "name": "@my-app/my-capability",
  "type": "module",
  "exports": {
    "./capability": "./src/capability.ts"
  }
}
```

The `src/routes` folder is optional. If present, `lorionReact()` can expose it
to TanStack Router as a capability-owned route subtree.

## Vite

```ts
import { capabilityLoader, lorionReact } from '@lorion-org/react/vite';
```

`capabilityLoader` is the standalone loader used by Model B. `lorionReact()`
bundles that loader with the Model A route config.

The Vite helper discovers `capabilities/*/capability.json`, validates the descriptor shape with LORION, resolves selected descriptors through the LORION composition graph, resolves each active capability's activation entry, and exposes `virtual:capabilities`.

```ts
const lorion = lorionReact({
  workspaceRoot,
  routesDirectory,
  defaultSelection: ['default'],
});

export default defineConfig({
  plugins: [
    lorion.capabilityLoader,
    tanstackStart({
      router: {
        virtualRouteConfig: lorion.routeConfig,
      },
    }),
  ],
});
```

By default the Vite helper reads the shared capability seed from
`--capabilities`, `npm_config_capabilities`, and `LORION_CAPABILITIES` before it
falls back to `defaultSelection`. No `selectionSeed.key` option is required for
that default. Pass `selectionSeed` only to override the seed names, inject custom
`argv`/`env` for tests, or set `selectionSeed: false` to disable CLI/env lookup.

Route config generation stays TanStack-focused and only includes enabled,
selected capability route directories. If no `selected`, seed value,
`defaultSelection`, or `baseDescriptors` are provided, every enabled local
capability remains active.
Use `indexRouteFile: false` when `/` is owned by a capability route.

The virtual module exports `capabilityModules`, `selectedCapabilityIds`, and
`resolvedCapabilityIds` so host code can distinguish the seed from the final
graph resolution.

### Activation

Activation binds a resolved descriptor to the module the host imports. LORION
supports two models, chosen by the host.

Convention (default): each capability activates through a `./capability` package
export with a `capability` named export. No option is required.

Explicit resolver: pass an `activation` resolver to bind against an existing
package export, so capabilities that already expose their contribution from
another entry point need no dedicated activation file:

```ts
capabilityLoader({
  workspaceRoot,
  activation: ({ descriptor }) => ({
    exportSubpath: './web',
    exportName: `${descriptor.id}WebPlugin`,
  }),
});
```

The generated import then uses the resolved subpath and export name (for example
`import { homeWebPlugin as homeCapability } from '@scope/home/web'`), and
specifier resolution is left to the host bundler rather than self-resolved by
LORION.

Graph-only: when the resolver returns a nullish activation for a descriptor, that
capability still takes part in dependency resolution but activates nothing. No
import is emitted and it never reaches `capabilityModules`. Use this for
dependency-only libraries that shape the graph without contributing a runtime
plugin.

## Bring Your Own Runtime (Model B)

In Model B the host uses only the Vite capability loader and composes the
resolved modules with its own runtime. The build resolves the descriptor graph
(base, selected features, transitive dependencies, and exactly one provider per
capability) and emits `capabilityModules` already ordered and filtered.

```ts
// vite.config.ts
capabilityLoader({
  workspaceRoot,
  capabilitiesDir: 'packages',
  baseDescriptors: ['shell', 'auth'], // always-on platform base
  defaultSelection: ['home', 'reports'], // default feature set
  selectionSeed: { cliKeys: ['features'], envKeys: ['APP_FEATURES'] },
  // Read a host-defined descriptor field; return undefined to keep a package
  // graph-only. LORION descriptors carry host keys unchanged.
  activation: ({ descriptor }) => descriptor.surfaces?.web,
});
```

To reuse the framework-free surface convention from
[`@lorion-org/surface-activation`](../surface-activation) directly — without a
per-host adapter — pass `surface` instead of `activation`. The convention detects
a surface by a file marker and derives its export name and import subpath (here the
canonical `@scope/<id>/web/plugin` entry):

```ts
import { conventionActivation } from '@lorion-org/surface-activation';

capabilityLoader({
  workspaceRoot,
  capabilitiesDir: 'packages',
  baseDescriptors: ['shell', 'auth'],
  defaultSelection: ['home', 'reports'],
  surface: {
    name: 'web',
    activation: conventionActivation({
      web: {
        marker: (dir) => existsSync(`${dir}/src/web/plugin.ts`),
        exportName: (id) => `${id}WebPlugin`,
        exportSubpath: './web/plugin',
      },
    }),
  },
});
```

```ts
// main.ts: consume the pre-resolved list with your own registry
import { capabilityModules } from 'virtual:capabilities';
import { createRegistry } from './my-plugin-system';

const registry = createRegistry();
for (const plugin of capabilityModules) registry.register(plugin);
await registry.setup();
```

The host runtime lists no capability by hand and makes no provider decision.
Adding or removing a package changes only the descriptor graph, not the runtime
wiring. Route ownership, i18n merging, and lifecycle hooks stay in the host's own
plugin system.

## Runtime Config

React runtime config follows the same LORION ownership model as other
capability data: a capability owns its config contract, deployment inputs provide
values, and the framework adapter exposes only the safe runtime view.

By default the React Vite adapter looks for:

```text
capabilities/<capability>/capability.schema.json
.data/runtime-config/<capability>/capability.runtime.json
```

Hosts can configure the convention once:

```ts
const lorion = lorionReact({
  workspaceRoot,
  routesDirectory,
  runtimeConfig: {
    configFileName: 'capability.runtime.json',
    schemaFileName: 'capability.schema.json',
  },
});
```

By default, file-backed config is read from `<workspaceRoot>/.data`. Hosts that
need a deployment-controlled var dir can configure an env key:

```ts
const lorion = lorionReact({
  workspaceRoot,
  routesDirectory,
  runtimeConfig: {
    varDir: {
      envKey: 'REACT_VAR_DIR',
    },
  },
});
```

Runtime files use unprefixed capability-local sections:

```json
{
  "public": {
    "url": "https://id.example.test",
    "realm": "demo",
    "clientId": "web"
  },
  "private": {
    "clientSecret": "server-only"
  }
}
```

The adapter also reads Vite env files and process env. Public keys use the
`VITE_<CAPABILITY>_<KEY>` convention, while private keys use
`<CAPABILITY>_<KEY>`:

```text
VITE_AUTH_OIDC_URL=https://id.example.test
VITE_AUTH_OIDC_REALM=demo
VITE_AUTH_OIDC_CLIENT_ID=web
AUTH_OIDC_CLIENT_SECRET=server-only
```

Env values override runtime files. Only `public` config is emitted through
`virtual:capability-runtime-config`; server code can opt into
`virtual:capability-runtime-config/server`. The server virtual module is
SSR-only and fails during client builds to prevent private config from being
bundled.

Render the config provider near the capability runtime provider:

```tsx
import { CapabilityRuntimeConfigProvider } from '@lorion-org/react';
import { capabilityRuntimeConfig } from 'virtual:capability-runtime-config';

<CapabilityRuntimeConfigProvider runtimeConfig={capabilityRuntimeConfig}>
  <App />
</CapabilityRuntimeConfigProvider>;
```

Capability code reads scoped public config:

```ts
import { useCapabilityRuntimeConfig } from '@lorion-org/react';

const authOidc = useCapabilityRuntimeConfig('auth-oidc');
console.log(authOidc.public.url);
```

## Provider Selection

Capabilities that implement another capability can declare `providesFor`.
Provider-owned defaults use `defaultFor` on the provider descriptor:

```json
{
  "id": "payment-provider-stripe",
  "version": "1.0.0",
  "providesFor": "checkout",
  "defaultFor": "checkout"
}
```

`providesFor` and `defaultFor` both accept a string or string array. If a
capability descriptor exists, `defaultFor` also creates the composition relation
from that capability to the default provider.

Profiles can still declare descriptor preferences with `providerPreferences`.
Use this when the profile, not the provider package, owns the default choice:

```json
{
  "id": "web",
  "version": "1.0.0",
  "providerPreferences": {
    "checkout": "payment-provider-stripe"
  }
}
```

When a provider capability is explicitly selected through the normal selection
seed, the Vite helper removes lower-priority `defaultFor` and
`providerPreferences` relations for that capability before graph resolution.
That selected provider wins over descriptor defaults and preferences. A losing
provider is only present if another hard dependency still requires it.

Read the resolved provider selection from the runtime:

```ts
import { getCapabilityProviderSelection } from '@lorion-org/react';

const selection = getCapabilityProviderSelection(capabilityRuntime);
```

Explicit `configuredProviders` passed to `getCapabilityProviderSelection()`
override selected providers, provider-owned defaults, and descriptor
preferences. `selectedProviders` can mirror the descriptor seed at runtime, and
`fallbackProviders` are merged with descriptor defaults and only used when no
configured or selected provider exists.

The React example uses the first variant by default: Stripe declares
`defaultFor: "checkout"` and is selected as the fallback provider. Selecting
`web payment-provider-invoice` through the seed switches checkout to Invoice and
leaves Stripe out of the resolved capabilities.

## API

The package exposes two public entry points:

- `@lorion-org/react` for runtime, contribution contracts, provider selection, runtime config, and React context helpers
- `@lorion-org/react/vite` for capability discovery, runtime-config virtual modules, and TanStack-compatible route config

## Example apps

Two runnable examples (at the repo root under `examples/`) demonstrate the two
models. Both run with Lorion's `lorion-source` export condition so local
workspace imports resolve to `src` instead of stale `dist` output.

Model A, `examples/react-runtime`, mirrors the Nuxt example with a demo shop,
checkout providers, and a tech monitor (composition runtime and file-based
routing):

```sh
pnpm --filter @lorion-examples/react-runtime dev
```

It runs on `http://localhost:3200` with capabilities under
`examples/react-runtime/capabilities`. Select a different profile or provider with
`--capabilities=admin`, `--capabilities=web,payment-provider-invoice`, or
`LORION_CAPABILITIES="web payment-provider-invoice"`.

Model B, `examples/react-loader`, shows the capability-loader-only path: explicit
activation, a graph-only library, a base plus seed selection, provider selection,
and a small hand-written registry that consumes `virtual:capabilities` with no
LORION React runtime and no route config:

```sh
pnpm --filter @lorion-examples/react-loader dev
```

It runs on `http://localhost:3201` with capabilities under
`examples/react-loader/capabilities`. The seed replaces the default selection, while
the base and providers resolve through the graph: switch the auth provider with
`--features=dashboard,auth-oidc`, or change the feature set with
`LORION_FEATURES="dashboard reports"`.

## Local Commands

```shell
cd packages/react
pnpm build
pnpm test
pnpm typecheck
pnpm package:check
```
