# LORION

LORION is the **Layer Orchestration Runtime for Node.js**.

[![CI](https://github.com/lorion-org/lorion/actions/workflows/ci.yml/badge.svg)](https://github.com/lorion-org/lorion/actions/workflows/ci.yml)
[![npm @lorion-org/react](https://img.shields.io/npm/v/@lorion-org/react?label=%40lorion-org%2Freact)](https://www.npmjs.com/package/@lorion-org/react)
[![license](https://img.shields.io/github/license/lorion-org/lorion)](./LICENSE)

Status: `1.0.0-beta`. See the [roadmap and stability policy](./docs/roadmap.md) for the path to a stable 1.0.

![LORION hero](./docs/assets/lorion-hero.png)

It is a small TypeScript package ecosystem for applications that are assembled
from selectable layers instead of one fixed module list. LORION resolves
descriptor-defined profiles, composes runtime configuration, selects capability
providers, and lets framework adapters activate the resulting application
shape.

Framework adapters include `@lorion-org/nuxt` for Nuxt layer orchestration and
`@lorion-org/react` for React capability runtimes, Vite discovery, and
capability-owned route composition. The surrounding packages keep the reusable
pieces portable: graph resolution, descriptor discovery, provider selection,
registries, and runtime-config projection.

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
pnpm add @lorion-org/react react
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

Use the React adapter when a React application should discover local capability
packages and expose their activation exports through Vite:

```ts
import { lorionReact } from '@lorion-org/react/vite';

const lorion = lorionReact({
  workspaceRoot,
  routesDirectory,
  selected: ['default'],
});
```

## Packages

| Package                              | Purpose                                                                                |
| ------------------------------------ | -------------------------------------------------------------------------------------- |
| `@lorion-org/capability-composition` | Framework-free capability selection, activation, and runtime/build-time composition.   |
| `@lorion-org/composition-graph`      | Descriptor, relation, and composition graph core.                                      |
| `@lorion-org/descriptor-discovery`   | Node-side descriptor discovery helpers.                                                |
| `@lorion-org/descriptor-selection`   | Provider-aware descriptor selection: resolve the active set from a seed.               |
| `@lorion-org/provider-selection`     | Capability provider selection.                                                         |
| `@lorion-org/react`                  | React capability runtime, contribution helpers, Vite discovery, and capability routes. |
| `@lorion-org/registry-hub`           | Generic runtime registry for named entries.                                            |
| `@lorion-org/runtime-config`         | Runtime config fragment projection, lookup, and environment helpers.                   |
| `@lorion-org/runtime-config-node`    | File-system and loader helpers for runtime config.                                     |
| `@lorion-org/nuxt`                   | Main Nuxt adapter for descriptor-selected layer orchestration.                         |

Package-specific usage, API notes, and examples live in each package README
under `packages/<name>/`.

## Requirements

- Node.js 20.19 or newer on the Node 20 LTS line, or Node.js 22.12 or newer
- pnpm 10
- Bun (optional) — recommended for running the examples from source; the example
  tooling falls back to Node's `--conditions` resolver when Bun is absent

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
- `pnpm snippets:check` type-checks the per-package documentation snippets under
  `packages/*/examples/`
- `pnpm examples:verify` type-checks and builds the runnable example apps under
  `examples/`
- `pnpm package:check`
- `pnpm check` runs the full local gate: Prettier, package build, ESLint, tests,
  package TypeScript, doc snippets, example apps, and package checks

The `build` and `typecheck` scripts target `packages/*` only — the example apps
are dev-only and are verified separately via `pnpm examples:verify`, so a broken
example never breaks the package build.

`pnpm package:check` runs each package's publish-facing checks. Package checks
use standard tooling: build the package, run `pnpm pack --dry-run`, and validate
the published package shape with `publint`.

## Examples

Runnable integration examples live under [`examples/`](./examples) — see
[`examples/README.md`](./examples/README.md). Start one from the repository root:

```shell
pnpm example:react-runtime   # React, capability runtime + file-based routing
pnpm example:react-loader    # React, capability loader + host-owned runtime
pnpm example:nuxt            # Nuxt module + layer extensions
```

## Documentation

- [Docs index](./docs/index.md)
- [Release workflow](./docs/release.md)
- [Contributing](./CONTRIBUTING.md)
- [Security policy](./SECURITY.md)
- [Code of conduct](./CODE_OF_CONDUCT.md)
- [License](./LICENSE)
