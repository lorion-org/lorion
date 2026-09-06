# @lorion-org/composition-graph

Framework-free descriptor catalogs, relation graphs, and composition selection logic.

This package models flat named descriptors, their declared relations, optional base descriptors, and deterministic composition flows.

## Install

```shell
pnpm add @lorion-org/composition-graph
```

## What it is

- a typed descriptor model for flat descriptors
- a graph builder for declared relations
- a catalog for querying profiles and relation paths
- a selection layer for resolving selected and base descriptors into a final set
- a policy that a registered relation extends instead of replacing
- the declared contribution relation, and a check over every name a relation carries

## What it is not

- not a package manager
- not a filesystem discovery tool
- not a framework adapter
- not a runtime-config loader

## Relations a host registers

A relation descriptor carries the roles it is walked for, and
`extendCompositionPolicy` appends each registered relation to the lists its roles
name. A host adds an edge without restating the lists a composition already walks:

```ts
import {
  contributionRelationDescriptor,
  createDescriptorCatalog,
  extendCompositionPolicy,
} from '@lorion-org/composition-graph';

const relationDescriptors = [contributionRelationDescriptor()];
const catalog = createDescriptorCatalog({ descriptors, relationDescriptors });
const selection = catalog.resolveSelection({
  selected: ['storefront'],
  policy: extendCompositionPolicy(undefined, relationDescriptors),
});
```

A relation without roles is registered and walked by nothing: its edges are
readable, and the composition resolves exactly as it did before.

## The contribution relation

A descriptor offers named points through `contributionPoints`, and other descriptors
declare which of them they fill through `contributesTo`. It is the non-exclusive
counterpart to `providesFor`: several descriptors may fill one point, and filling it
replaces nothing.

```ts
import { resolveContributions } from '@lorion-org/composition-graph';

const contributions = resolveContributions(descriptors);
contributions.receives('checkout');
// [{ from: 'payment-provider-invoice', to: 'checkout', point: 'payment-method' }]
```

A contribution to an unknown descriptor, to a point its owner does not declare, or to
the contributor itself aborts while the declaring descriptor can still be named.
Resolution does not walk the relation: a contribution says where a descriptor's output
lands, not what has to be present for it to work.

## Names that resolve to nothing

A relation resolves only for a target the descriptor map holds; every other name is
skipped, and the composition quietly becomes smaller than it reads.
`assertKnownReferences({ descriptors, relationDescriptors })` reports such a name
together with the descriptor that declared it and the relation it declared it under.

## Basic example

```ts
import { createDescriptorCatalog } from '@lorion-org/composition-graph';

const catalog = createDescriptorCatalog({
  descriptors: [
    {
      id: 'default',
      version: '1.0.0',
      dependencies: { web: '^1.0.0' },
    },
    {
      id: 'web',
      version: '1.0.0',
      dependencies: {
        checkout: '^1.0.0',
        payments: '^1.0.0',
        'payment-provider-invoice': '^1.0.0',
        'payment-provider-stripe': '^1.0.0',
        shops: '^1.0.0',
        'shop-coffee': '^1.0.0',
        'shop-stationery': '^1.0.0',
      },
    },
    {
      id: 'checkout',
      version: '1.0.0',
      dependencies: { payments: '^1.0.0' },
    },
    {
      id: 'payments',
      version: '1.0.0',
    },
    {
      id: 'shops',
      version: '1.0.0',
    },
    {
      id: 'payment-provider-invoice',
      version: '1.0.0',
      providesFor: 'payment-checkout',
      dependencies: { payments: '^1.0.0' },
    },
    {
      id: 'payment-provider-stripe',
      version: '1.0.0',
      defaultFor: 'payment-checkout',
      providesFor: 'payment-checkout',
      dependencies: { payments: '^1.0.0' },
    },
    {
      id: 'shop-coffee',
      version: '1.0.0',
      dependencies: { shops: '^1.0.0' },
    },
    {
      id: 'shop-stationery',
      version: '1.0.0',
      dependencies: { shops: '^1.0.0' },
    },
  ],
});

const selection = catalog.resolveSelection({
  selected: ['default'],
});

console.log(selection.getResolved());
console.log(selection.getProvenance());
```

## Example: explicit base descriptors

Use `baseDescriptors` for descriptors that always participate in the
resolution for a given runtime, deployment, or application shell.

```ts
import { createDescriptorCatalog } from '@lorion-org/composition-graph';

const catalog = createDescriptorCatalog({
  descriptors: [
    {
      id: 'web',
      version: '1.0.0',
      dependencies: { checkout: '^1.0.0', shops: '^1.0.0' },
    },
    {
      id: 'checkout',
      version: '1.0.0',
      dependencies: { payments: '^1.0.0' },
    },
    {
      id: 'payments',
      version: '1.0.0',
    },
    {
      id: 'shops',
      version: '1.0.0',
    },
  ],
});

const selection = catalog.resolveSelection({
  baseDescriptors: ['web'],
});

selection.getResolved();
// => ['checkout', 'payments', 'shops', 'web']
```

## Example: normalize selection seeds

Host adapters often accept descriptor selections from CLI flags, package-manager
config variables, environment variables, or static defaults. Use
`resolveDescriptorSelectionSeed()` at that boundary and pass the resulting ids to
the catalog or framework adapter.

The graph package does not prescribe a domain word for selection. Pass `key`
when you want derived CLI and environment names, or pass explicit `cliKeys` and
`envKeys`. Framework adapters such as `@lorion-org/nuxt` and
`@lorion-org/react` provide their own `capability` default.

```ts
import { resolveDescriptorSelectionSeed } from '@lorion-org/composition-graph';

const selected = resolveDescriptorSelectionSeed({
  argv: process.argv,
  defaultValue: ['default'],
  env: process.env,
  key: 'capability',
});

// --capabilities=admin,checkout
// LORION_CAPABILITIES="admin checkout"
// => ['admin', 'checkout']
```

## Example: explain why something is present

The catalog and selection APIs expose path explanation helpers for diagnostics,
admin UIs, and composition debugging.

```ts
import { createDescriptorCatalog } from '@lorion-org/composition-graph';

const catalog = createDescriptorCatalog({
  descriptors: [
    {
      id: 'web',
      version: '1.0.0',
      dependencies: { checkout: '^1.0.0' },
    },
    {
      id: 'checkout',
      version: '1.0.0',
      dependencies: { payments: '^1.0.0' },
    },
    {
      id: 'payments',
      version: '1.0.0',
    },
  ],
});

catalog.explain({
  from: 'web',
  to: 'payments',
  relationIds: ['dependencies'],
});
// => [
//   { from: 'web', to: 'checkout', relation: 'dependencies' },
//   { from: 'checkout', to: 'payments', relation: 'dependencies' },
// ]
```

## Example: combine with descriptor discovery

`@lorion-org/composition-graph` expects flat descriptors. If your authoring format
allows nested descriptor documents, flatten them before building the catalog.

```ts
import { createDescriptorCatalog } from '@lorion-org/composition-graph';
import { discoverDescriptors } from '@lorion-org/descriptor-discovery';

const discovered = discoverDescriptors({
  cwd: '.',
  descriptorPaths: ['layer-extensions/*/extension.json'],
  nestedField: 'bundles',
});

const catalog = createDescriptorCatalog({
  descriptors: discovered.map((entry) => entry.descriptor),
});
```

## Relations

- `dependencies` is the only built-in relation
- every additional relation must be registered via `relationDescriptors`
- unconfigured descriptor fields are ignored by the graph
- selection seed parsing belongs at the host adapter boundary
- nested descriptor authoring belongs in a discovery or normalization layer, not in this package

`relationDescriptors` are intentionally small:

- `id` identifies the relation in graph queries and policies
- `field` optionally maps the relation to a descriptor field name
- `targetMode: 'values'` reads object values instead of object keys
- `direction: 'incoming'` builds inverse edges from a target field back to the descriptor

The core graph does not prescribe provider policy, hinting, or weighting. Those
concerns belong in higher layers. A framework adapter can, for example, register
an inverse `defaultProviders` relation for provider-owned defaults:

```ts
const catalog = createDescriptorCatalog({
  descriptors,
  relationDescriptors: [{ id: 'defaultProviders', field: 'defaultFor', direction: 'incoming' }],
});
```

That turns `{ id: 'auth-oidc', defaultFor: 'auth' }` into a graph edge
`auth -> auth-oidc`, as long as both descriptors exist.

Dependency-specific projections are also intentionally outside the core. If a
consumer needs a "what pulled this in?" view, derive that from
`getProvenance()` in its own adapter or UI layer.

## Local commands

```shell
cd packages/composition-graph
pnpm build
pnpm test
pnpm coverage
pnpm typecheck
pnpm package:check
```
