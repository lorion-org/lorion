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

## What it is not

- not a package manager
- not a filesystem discovery tool
- not a framework adapter
- not a runtime-config loader

## Basic example

```ts
import { createDescriptorCatalog } from '@lorion-org/composition-graph';

const catalog = createDescriptorCatalog({
  relationDescriptors: [
    {
      id: 'integrations',
      field: 'integrations',
    },
  ],
  descriptors: [
    {
      id: 'billing',
      version: '1.0.0',
      dependencies: { storage: '*' },
      integrations: { analytics: '*' },
    },
    {
      id: 'storage',
      version: '1.0.0',
    },
    {
      id: 'analytics',
      version: '1.0.0',
    },
    {
      id: 'web-shell',
      version: '1.0.0',
      dependencies: { router: '*' },
    },
    {
      id: 'router',
      version: '1.0.0',
    },
  ],
});

const selection = catalog.resolveSelection({
  selected: ['billing'],
  baseDescriptors: ['web-shell'],
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
      id: 'billing',
      version: '1.0.0',
      dependencies: { storage: '*' },
    },
    {
      id: 'storage',
      version: '1.0.0',
    },
    {
      id: 'web-shell',
      version: '1.0.0',
      dependencies: { router: '*' },
    },
    {
      id: 'router',
      version: '1.0.0',
    },
  ],
});

const selection = catalog.resolveSelection({
  selected: ['billing'],
  baseDescriptors: ['web-shell'],
});

selection.getResolved();
// => ['billing', 'router', 'storage', 'web-shell']
```

## Example: explain why something is present

The catalog and selection APIs expose path explanation helpers for diagnostics,
admin UIs, and composition debugging.

```ts
import { createDescriptorCatalog } from '@lorion-org/composition-graph';

const catalog = createDescriptorCatalog({
  descriptors: [
    {
      id: 'billing',
      version: '1.0.0',
      dependencies: { storage: '*' },
    },
    {
      id: 'storage',
      version: '1.0.0',
      dependencies: { queue: '*' },
    },
    {
      id: 'queue',
      version: '1.0.0',
    },
  ],
});

catalog.explain({
  from: 'billing',
  to: 'queue',
  relationIds: ['dependencies'],
});
// => [
//   { from: 'billing', to: 'storage', relation: 'dependencies' },
//   { from: 'storage', to: 'queue', relation: 'dependencies' },
// ]
```

## Example: combine with descriptor discovery

`@lorion-org/composition-graph` expects flat descriptors. If your authoring format
allows nested descriptor documents, flatten them before building the catalog.

```ts
import { createDescriptorCatalog } from '@lorion-org/composition-graph';
import { discoverDescriptors } from '@lorion-org/descriptor-discovery';

const discovered = discoverDescriptors({
  roots: ['./descriptors'],
  descriptorFileName: 'descriptor.json',
  idField: 'name',
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
- string parsing for user-facing selection input belongs in a higher adapter layer
- nested descriptor authoring belongs in a discovery or normalization layer, not in this package

`relationDescriptors` are intentionally small:

- `id` identifies the relation in graph queries and policies
- `field` optionally maps the relation to a descriptor field name

The core graph does not prescribe directional interpretation, hinting, or
weighting. Those concerns belong in higher layers.

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
