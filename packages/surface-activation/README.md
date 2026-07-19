# @lorion-org/surface-activation

Framework-free **surface activation**: given a capability that lives as an on-disk
package, decide _which module and exported symbol_ provides a named "surface" (for
example `web` or `server`), and build the import specifier to reach it — by
file-layout convention, with no surface config in the descriptor.

It is pure: no filesystem access, no framework, no runtime. The same seam is shared
by build-time hosts (which code-generate static imports) and runtime hosts (which
dynamically `import()`), so the addressing rule lives in exactly one place instead
of being reinvented per host.

## Concepts

- **`SurfaceConvention`** — how a host detects a surface (`marker`), names its
  export (`exportName(id)`), and where it is exported from (`exportSubpath`).
- **`conventionActivation(surfaces)`** — builds an `ActivationResolver` from
  per-surface conventions.
- **`fileSurfaceConvention(options)`** — a ready-made `SurfaceConvention` for the
  common file-layout case: the surface exists when one of `files` is present, and its
  export is `camelCase(id) + exportSuffix`. It bakes the marker and naming so a host
  stops repeating them per surface; existence is injected (`exists`) so this package
  stays I/O-free.
- **`capabilitySpecifier(packageName, exportSubpath)`** — the one rule for a
  capability's import specifier (`@acme/shops` + `./web` → `@acme/shops/web`).
- **`resolveSurfaceModules(active, surface, activation)`** — for each active
  capability that provides the surface, the specifier and export name to import.

## Usage

```ts
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  conventionActivation,
  fileSurfaceConvention,
  resolveSurfaceModules,
} from '@lorion-org/surface-activation';

const activation = conventionActivation({
  web: fileSurfaceConvention({
    files: ['src/web.ts'], // surface present when any listed file exists
    exportSuffix: 'WebPlugin', // exportName = camelCase(id) + suffix
    exportSubpath: './web',
    exists: existsSync, // injected — the package itself touches no filesystem
    join, // optional; defaults to a POSIX join
  }),
});

// `active` is any list of { id, directory, packageName } items.
const modules = resolveSurfaceModules(active, 'web', activation);
// -> [{ capability, specifier: '@acme/shops/web', exportName: 'shopsWebPlugin' }, ...]
```

The convention is the only surface-specific part: swap `exportSuffix`/`exportSubpath`
(and `files`) for a `server` surface, an `api` surface, or any other. The raw
`SurfaceConvention` object stays available for cases the preset does not cover.

A build-time host emits a static `import` per entry; a runtime host feeds each
`specifier` to a dynamic `import()`. Both use the identical list.

## Consumers in this repo

- `@lorion-org/capability-composition` — feeds the specifiers to its runtime
  `composeCapabilities` loop, and re-exports the convention builders
  (`conventionActivation`, `fileSurfaceConvention`) and their types for callers of
  that loop. The build-time addressing tools (`resolveSurfaceModules`,
  `capabilitySpecifier`) are imported from this package directly.
- `@lorion-org/react` — uses `capabilitySpecifier` when code-generating static
  capability imports at build time.
