# @lorion-org/capability-composition

Framework-free capability composition over the LORION core.

It resolves a descriptor-defined capability set (discovery, dependency-graph selection, provider selection, and seeding), detects surfaces by a host-defined convention, and composes the active capabilities into any runtime. One composition path is shared by build-time hosts (for example a Vite adapter) and runtime hosts (for example a Bun server); each host supplies only its activation convention and its registration.

## Install

```shell
pnpm add @lorion-org/capability-composition
```

## API

- `resolveSelectedCapabilities(input)` resolves the active capabilities: base descriptors, the selection seed, transitive dependencies, and exactly one provider per capability. Items come back ordered by id: stable for a given input and independent of discovery order, but not dependency order.
- `resolveCapabilitySelection(input)` resolves the same set and additionally returns the `ProviderSelectionResolution` (which provider won each contested capability, in which mode, and which ones lost) and `discovered`, every descriptor id the run knew about, groupings and nested descriptors included. It describes the composed set, so a host can name an artifact after the winner or report on the run.
- `CapabilitySelectionInput` is the composition contract every host adapter accepts: `workspaceRoot`, `capabilitiesDir`, `descriptorPaths`, `descriptorSchema`, `virtualDescriptors`, `bundles`, `nestedField`, `relationDescriptors`, `policy` and `seed`. `CAPABILITY_SELECTION_OPTIONS` enumerates the options an adapter must forward. Each adapter's test suite carries one behavioural case per entry, and a missing case fails to compile.
- `conventionActivation(surfaces)` builds an activation resolver from per-surface conventions (a file-layout marker plus an export-name derivation), so descriptors carry no surface config. Re-exported from [`@lorion-org/surface-activation`](../surface-activation), which owns the addressing convention.
- `composeCapabilities(input)` takes `CapabilityCompositionInput`, the selection input plus `surface`, `activation`, `load` and `register`. It forwards the selection input whole, so a runtime composition resolves exactly what the build-time one does. It resolves the active set and, for each capability that provides the surface, loads its module and hands the exported value to the host's registration. Registry- and framework-agnostic.
- `descriptorPaths` (optional) takes glob patterns and replaces the `capabilitiesDir` convention when a host's descriptors span several roots. `descriptorSchema` (optional) replaces the shared descriptor schema, or disables validation with `false`. `nestedField` (optional) names the field in a discovered descriptor that holds further descriptors, which are resolved as groupings: a synthetic directory, no package name, no surface. `relationDescriptors` and `policy` (optional) add relations to walk and change how the graph resolves them.
- `virtualDescriptors` (optional) are host-provided descriptors that join the discovered set for graph resolution without living on disk as packages: grouping descriptors (bundles) whose `dependencies` point at real capabilities. They take part in selection but carry no surface, so they are never imported and need no `package.json`. This is the second, filesystem-free way to feed the composition, alongside disk discovery.
- `bundles: { cwd, fileName? }` (optional) is the batteries-included path: it discovers a bundle manifest upward from `cwd` (via `loadBundleManifest` in [`@lorion-org/descriptor-discovery`](../descriptor-discovery)) and adds its declared groupings to `virtualDescriptors`. A host declares bundles in data and needs no bundling code of its own. The manifest declares descriptors only; the host names `seed.baseDescriptors` and `seed.defaultSelection`, so one manifest serves runs that seed it differently.
- `createWorkspaceLoad({ workspaceRoot, packagesDir? })` builds the `load` callback `composeCapabilities` needs for a Node/Bun workspace host: it imports a workspace package from `<workspaceRoot>/<packagesDir>/<folder>` through its declared `exports`. `packagesDir` defaults to `'packages'`. This is the runtime counterpart to build-time workspace source aliases — a workspace host needs no per-host loading code of its own.
- `resolveWorkspaceRoot(from, { markers? })` walks up from `from` (a file URL such as `import.meta.url`, or a path) until a directory holds all `markers` (default `['packages']`), and throws a clear error if none does.
- Build-time hosts that code-generate static imports use `resolveSurfaceModules` from [`@lorion-org/surface-activation`](../surface-activation) directly — the same seam `composeCapabilities` uses internally. It is intentionally not re-exported here, so a build-time host depends only on the light addressing package, not this runtime host.

### Reporting on a composition

`describeComposition(input)` turns one resolution into a `CompositionReport`, and
`formatCompositionReport(report, options?)` renders it as lines. Every host reports
alike, and a report cannot describe a different composition than the run it came
from.

See `snippets/composition-report.ts` for the wiring. Rendered, a report reads:

```
  Requested storefront
  Selected  storefront
  Base      commerce
  auth      auth-oidc (default)
  payment   payment-stripe (not in this composition)

  Resolved 4/6 descriptors
    auth-oidc, commerce, shop, storefront

  Not resolved 2 descriptors
    admin, payment-stripe
```

An aligned key column carries what was asked for and what won each contested
capability; each descriptor set hangs below its own heading, because a list of
hundreds of ids is a block and not one row's value.

The report is stated in descriptor ids alone. Whether a descriptor is a package on
disk, a mounted layer or a manifest grouping is a host's own view, so a host that
reports on that filters before it describes. Every id list is deduplicated and
sorted, so two reports of one run compare as equal text, and `discovered` is
required: defaulting it to `resolved` would make the count claim that nothing was
left out. A provider whose winner is not part of the composition is reported as
such rather than dropped, because that is a host configuring a provider the run
never built. `notResolved(report)` names what the workspace holds and this
composition leaves out.

Rendering stays with the host: `width` hard-wraps the id lists so a terminal never
soft-wraps them, `leadingRows` adds host-owned rows such as a dev-server address to
the same key column, and `palette` colours one role per thing a reader
distinguishes: `label` for keys and headings, `accent` for numbers and addresses,
`id` for what the composition activates and `muted` for what it leaves out or only
supports. It defaults to colourless.

### Workspace host loader

A Node/Bun host that runs from a monorepo can wire `composeCapabilities` with no
bespoke loader:

```ts
import {
  composeCapabilities,
  createWorkspaceLoad,
  resolveWorkspaceRoot,
} from '@lorion-org/capability-composition';

const workspaceRoot = resolveWorkspaceRoot(import.meta.url);

await composeCapabilities({
  workspaceRoot,
  seed: { defaultSelection: ['web'] },
  surface: 'server',
  activation,
  load: createWorkspaceLoad({ workspaceRoot }),
  register,
});
```

`createWorkspaceLoad` is pure Node/Bun (`node:fs`, `node:path`, `node:url`, dynamic
import) and carries no product specifics — the packages directory and the root
markers are parameters. Its `exports` resolution is a deliberate subset of Node
resolution: a string target, a subpath map, or the conditions-only `.` sugar, with
conditional objects resolved in `import`, then `require`, then `default` order (both
load through `import()`); the declaration-only `types` condition is never followed,
and subpath patterns (`./*`) and the `node` condition are not implemented. A
specifier or `exports` target that would escape the packages directory is rejected.
It lives in this package (rather than a separate `-node` package) because this
package is already Node-bound via `readPackageName`, has no env-agnostic core to
protect, and `sideEffects: false` lets a bundler drop these helpers when a host
supplies its own `load`.

## What It Is Not

- not a framework runtime or plugin registry
- not a bundler or a router
- not an application naming convention

## Composition timing: runtime vs build-time

The same descriptor selection drives two host styles, differing only in _when_
composition runs and _how_ modules are loaded:

- **Runtime** — call `composeCapabilities` at boot with a dynamic
  `load: (specifier) => import(specifier)`, or `createWorkspaceLoad(...)` for a
  monorepo host that loads packages from their `exports`. Simple and fine for a
  source-run server that starts once; resolution is a one-time boot cost.
- **Build-time** — run `resolveSelectedCapabilities` (here) + `resolveSurfaceModules`
  (from `@lorion-org/surface-activation`) in a build step and code-generate _static_
  imports. The injected set is fixed and
  auditable at build time, with no runtime discovery or dynamic `import()` —
  suited to bundled or air-gapped artifacts.

Both compose the identical set from one seam — `resolveSurfaceModules` in
`@lorion-org/surface-activation`. See `snippets/buildtime-composition.ts` for the
build-time manifest and `snippets/runtime-composition.ts` for the runtime host wired
with `resolveWorkspaceRoot` + `createWorkspaceLoad`.

## Local Commands

```shell
cd packages/capability-composition
pnpm build
pnpm test
pnpm typecheck
pnpm package:check
```
