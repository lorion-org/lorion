# LORION

LORION is the **Layer Orchestration Runtime for Node.js**.

It is a small TypeScript package ecosystem for applications that are assembled
from selectable layers instead of one fixed module list. LORION resolves
descriptor-defined profiles, composes runtime configuration, selects capability
providers, and lets framework adapters activate the resulting application
shape.

The primary integration target is `@lorion-org/nuxt`: a Nuxt 4 adapter that turns
selected descriptors into active Nuxt layers and wires the resulting runtime
configuration into the app. The surrounding packages keep the reusable pieces
portable: graph resolution, descriptor discovery, provider selection, registries,
and runtime-config projection.

## Why LORION?

Modern applications often need more than one valid shape: product editions,
customer deployments, white-label variants, optional providers, or profile-based
feature sets. Hardcoding those combinations in framework config makes the host
app grow around conditionals.

LORION moves that composition into explicit descriptors and small runtime
helpers:

- descriptors describe available layers and profiles
- the composition graph resolves the selected profile
- provider selection chooses one implementation per capability
- runtime-config packages keep layer-owned config scoped and projectable
- framework adapters activate the resolved application shape

## When To Use LORION

Use LORION when independent layers, providers, registries, or runtime-config
fragments should be selected and combined explicitly.

For a plain Nuxt application with a fixed layer list, Nuxt layers alone are
usually enough. LORION is useful when composition should be data-driven,
profile-based, or shared between framework-free packages, Node utilities, and
framework adapters.

## Install

Install only the packages your project needs:

```shell
pnpm add @lorion-org/runtime-config
pnpm add @lorion-org/nuxt @lorion-org/runtime-config
```

## Quick Start

Use a core package directly when you only need portable TypeScript behavior:

```ts
import {
  getPublicRuntimeConfigScope,
  projectSectionedRuntimeConfig,
} from '@lorion-org/runtime-config';

const runtimeConfig = projectSectionedRuntimeConfig(
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
);

const billing = getPublicRuntimeConfigScope(runtimeConfig, 'billing');

console.log(billing.apiBase);
// /api/billing
```

Use the Nuxt adapter when a Nuxt application should activate descriptor-selected
layers:

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

## Packages

| Package                            | Purpose                                                              |
| ---------------------------------- | -------------------------------------------------------------------- |
| `@lorion-org/composition-graph`    | Descriptor, relation, and composition graph core.                    |
| `@lorion-org/descriptor-discovery` | Node-side descriptor discovery helpers.                              |
| `@lorion-org/provider-selection`   | Capability provider selection.                                       |
| `@lorion-org/registry-hub`         | Generic runtime registry for named entries.                          |
| `@lorion-org/runtime-config`       | Runtime config fragment projection, lookup, and environment helpers. |
| `@lorion-org/runtime-config-node`  | File-system and loader helpers for runtime config.                   |
| `@lorion-org/nuxt`                 | Main Nuxt adapter for descriptor-selected layer orchestration.       |

Package-specific usage, API notes, and examples live in each package README
under `packages/<name>/`.

## Requirements

- Node.js 20.19 or newer on the Node 20 LTS line, or Node.js 22.12 or newer
- pnpm 10

## Development

Install dependencies and run workspace checks from the LORION repository root:

```shell
pnpm install
pnpm check
```

Common workspace commands:

- `pnpm build`
- `pnpm prettier` checks formatting with Prettier
- `pnpm prettier:fix` formats files with Prettier
- `pnpm eslint` runs ESLint
- `pnpm eslint:fix` runs ESLint with autofix enabled
- `pnpm tsc` runs TypeScript checks
- `pnpm test` runs the test suite
- `pnpm tests` is an alias for `pnpm test`
- `pnpm examples:check`
- `pnpm package:check`
- `pnpm check` runs the full local gate: Prettier, build, ESLint, tests,
  TypeScript, examples, and package checks

`pnpm package:check` runs each package's publish-facing checks. Package checks
use standard tooling: build the package, run `pnpm pack --dry-run`, and validate
the published package shape with `publint`.

## Documentation

- [Docs index](./docs/index.md)
- [Contributing](./CONTRIBUTING.md)
- [Security policy](./SECURITY.md)
- [Code of conduct](./CODE_OF_CONDUCT.md)
- [License](./LICENSE)
