# @lorion-org/descriptor-discovery

Disk-based discovery and normalization helpers for descriptor files.

This package is the Node-side companion to `@lorion-org/composition-graph`.
It is responsible for reading descriptor documents from disk and flattening
optional nested descriptor authoring into the flat `Descriptor[]` shape that
the graph core expects.

## Install

```shell
pnpm add @lorion-org/descriptor-discovery @lorion-org/composition-graph
```

## What it is

- a Node-side descriptor file discovery helper
- a normalization layer for descriptor ids and versions
- a small flattening helper for one level of nested descriptor authoring
- a bridge from files on disk to `@lorion-org/composition-graph`

## What it is not

- not a graph builder
- not a package manager
- not a framework adapter
- not a recursive schema language
- not a watcher or live reload system

## Directory shape

```text
descriptors/
  billing/
    descriptor.json
  dashboard/
    descriptor.json
```

## Basic example

```ts
import { discoverDescriptors } from '@lorion-org/descriptor-discovery';

const discovered = discoverDescriptors({
  roots: ['./descriptors'],
});

const descriptors = discovered.map((entry) => entry.descriptor);
```

`discoverDescriptors()` scans each direct child directory below every root and
loads a descriptor file when it exists. The directory name is used as a fallback
id when the descriptor does not define one.

## Example: custom descriptor fields

```ts
import { discoverDescriptors } from '@lorion-org/descriptor-discovery';

const discovered = discoverDescriptors({
  roots: ['./modules'],
  descriptorFileName: 'module.json',
  idField: 'name',
  nestedField: 'bundles',
});

discovered.map((entry) => entry.id);
```

Nested descriptors are flattened into the same output list as their parent.
Only one nesting level is supported so the resulting graph input stays explicit.

## Example: use with composition graph

```ts
import { createDescriptorCatalog } from '@lorion-org/composition-graph';
import { discoverDescriptors } from '@lorion-org/descriptor-discovery';

const discovered = discoverDescriptors({
  roots: ['./descriptors'],
});

const catalog = createDescriptorCatalog({
  descriptors: discovered.map((entry) => entry.descriptor),
});

catalog.resolveSelection({
  selected: ['billing'],
});
```

## Local commands

```shell
cd packages/descriptor-discovery
pnpm build
pnpm test
pnpm typecheck
pnpm package:check
```
