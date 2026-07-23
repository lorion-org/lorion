# @lorion-org/capability-composition

Framework-free capability composition over the LORION core.

It resolves a descriptor-defined capability set (discovery, dependency-graph selection, provider selection, and seeding), detects surfaces by a host-defined convention, and composes the active capabilities into any runtime. One composition path is shared by build-time hosts (for example a Vite adapter) and runtime hosts (for example a Bun server); each host supplies only its activation convention and its registration.

## Install

```shell
pnpm add @lorion-org/capability-composition
```

## API

- `resolveSelectedCapabilities({ workspaceRoot, capabilitiesDir, virtualDescriptors, seed })` resolves the active capabilities: base descriptors, the selection seed, transitive dependencies, and exactly one provider per capability.
- `conventionActivation(surfaces)` builds an activation resolver from per-surface conventions (a file-layout marker plus an export-name derivation), so descriptors carry no surface config. Re-exported from [`@lorion-org/surface-activation`](../surface-activation), which owns the addressing convention.
- `composeCapabilities({ workspaceRoot, capabilitiesDir, virtualDescriptors, seed, surface, activation, load, register })` resolves the active set and, for each capability that provides the surface, loads its module and hands the exported value to the host's registration. Registry- and framework-agnostic.
- `virtualDescriptors` (optional) are host-provided descriptors that join the discovered set for graph resolution without living on disk as packages: grouping descriptors (bundles) whose `dependencies` point at real capabilities. They take part in selection but carry no surface, so they are never imported and need no `package.json`. This is the second, filesystem-free way to feed the composition, alongside disk discovery.
- `bundles: { cwd, fileName? }` (optional) is the batteries-included path: it discovers a bundle manifest upward from `cwd` (via `loadBundleManifest` in [`@lorion-org/descriptor-discovery`](../descriptor-discovery)) and fills `virtualDescriptors`, `seed.baseDescriptors` and `seed.defaultSelection`. Explicit values win. A host declares bundles in data and needs no bundling code of its own.
- `seed.baseSeed` (optional) is a CLI/env override for `seed.baseDescriptors`, symmetric to `seed.selectionSeed`: a non-empty parse replaces the base descriptors, otherwise `baseDescriptors` stands. The base floor stays always-on regardless of the selection.
- Build-time hosts that code-generate static imports use `resolveSurfaceModules` from [`@lorion-org/surface-activation`](../surface-activation) directly — the same seam `composeCapabilities` uses internally. It is intentionally not re-exported here, so a build-time host depends only on the light addressing package, not this runtime host.

## What It Is Not

- not a framework runtime or plugin registry
- not a bundler or a router
- not an application naming convention

## Composition timing: runtime vs build-time

The same descriptor selection drives two host styles, differing only in _when_
composition runs and _how_ modules are loaded:

- **Runtime** — call `composeCapabilities` at boot with a dynamic
  `load: (specifier) => import(specifier)`. Simple and fine for a source-run
  server that starts once; resolution is a one-time boot cost.
- **Build-time** — run `resolveSelectedCapabilities` (here) + `resolveSurfaceModules`
  (from `@lorion-org/surface-activation`) in a build step and code-generate _static_
  imports. The injected set is fixed and
  auditable at build time, with no runtime discovery or dynamic `import()` —
  suited to bundled or air-gapped artifacts.

Both compose the identical set from one seam — `resolveSurfaceModules` in
`@lorion-org/surface-activation`. See `snippets/buildtime-composition.ts` for the
build-time manifest.

## Local Commands

```shell
cd packages/capability-composition
pnpm build
pnpm test
pnpm typecheck
pnpm package:check
```
