# @lorion-org/descriptor-discovery

Disk-based discovery and normalization helpers for descriptor files.

This package is the Node-side companion to `@lorion-org/composition-graph`.
It is responsible for reading descriptor documents from disk and flattening
optional nested descriptor authoring into the flat `Descriptor[]` shape that
the graph core expects.

## Install

```shell
pnpm add @lorion-org/descriptor-discovery @lorion-org/composition-graph @lorion-org/runtime-config
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
layer-extensions/
  checkout/
    extension.json
  shops/
    extension.json
```

## Basic example

```ts
import { discoverDescriptors } from '@lorion-org/descriptor-discovery';

const discovered = discoverDescriptors({
  cwd: '.',
  descriptorPaths: ['layer-extensions/*/extension.json'],
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
  cwd: '.',
  descriptorPaths: ['layer-extensions/*/extension.json'],
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
  cwd: '.',
  descriptorPaths: ['layer-extensions/*/extension.json'],
  nestedField: 'bundles',
});

const catalog = createDescriptorCatalog({
  descriptors: discovered.map((entry) => entry.descriptor),
});

catalog.resolveSelection({
  selected: ['default'],
});
```

## Example: bundle manifest

```jsonc
// bundles.json — `bundles` is a nested list of ordinary descriptors (same shape as
// any capability's descriptor). A manifest declares descriptors and nothing else:
// any other top-level key is rejected. `$schema` is allowed, for editor support.
{
  "$schema": "https://lorion.dev/schemas/bundles.schema.json",
  "bundles": [
    { "id": "base", "version": "0.0.0", "dependencies": { "ui": "^1.0.0", "auth": "^1.0.0" } },
    {
      "id": "shop",
      "version": "0.0.0",
      "dependencies": { "catalog": "^1.0.0", "checkout": "^1.0.0" },
    },
  ],
}
```

```ts
import { loadBundleManifest } from '@lorion-org/descriptor-discovery';

const virtualDescriptors = loadBundleManifest({ cwd: appDir });
```

`loadBundleManifest()` walks up from `cwd` to find a `bundles.json` (override with
`fileName`) and reads its `bundles` list as virtual descriptors. Each bundle is
validated against the same `descriptorSchema` a capability's descriptor is held to, so
a malformed grouping fails fast. This is the filesystem-free way to define grouping
bundles: a host declares them in data — no bespoke format, just descriptors — and
feeds them to composition, without one package per bundle. `bundleManifestSchema`
states the wrapper's shape, and `SchemaDescriptor` is the descriptor as
`descriptorSchema` describes it: the graph fields plus `runtimeConfig` and
`publicRuntimeConfig`. `DescriptorField` names every declared field and is held to
the JSON schema at compile time, in both directions.

A manifest is a grouping file, so it declares descriptors on a package and feature
basis and carries no run-wide keys. Which grouping is the always-on base and which is
the default selection belongs to a run, so the host names both in its seed
(`baseDescriptors`, `defaultSelection`) and one manifest serves runs that seed it
differently.

`virtualDescriptorDirectory(workspaceRoot, id)` (and the `VIRTUAL_DESCRIPTOR_DIR`
segment it uses) is the one shared convention for where a virtual descriptor is
addressed on disk: a synthetic path that never exists, so surface markers never
match and no `package.json` is read. Both the runtime and build-time hosts resolve
virtual descriptors through it instead of each hard-coding the segment.

## Local commands

```shell
cd packages/descriptor-discovery
pnpm build
pnpm test
pnpm typecheck
pnpm package:check
```
