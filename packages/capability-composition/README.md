# @lorion-org/capability-composition

Framework-free capability composition over the LORION core.

It resolves a descriptor-defined capability set (discovery, dependency-graph selection, provider selection, and seeding), detects surfaces by a host-defined convention, and composes the active capabilities into any runtime. One composition path is shared by build-time hosts (for example a Vite adapter) and runtime hosts (for example a Bun server); each host supplies only its activation convention and its registration.

## Install

```shell
pnpm add @lorion-org/capability-composition
```

## API

- `resolveSelectedCapabilities({ workspaceRoot, capabilitiesDir, seed })` resolves the active capabilities: base descriptors, the selection seed, transitive dependencies, and exactly one provider per capability.
- `conventionActivation(surfaces)` builds an activation resolver from per-surface conventions (a file-layout marker plus an export-name derivation), so descriptors carry no surface config.
- `composeCapabilities({ workspaceRoot, capabilitiesDir, seed, surface, activation, load, register })` resolves the active set and, for each capability that provides the surface, loads its module and hands the exported value to the host's registration. Registry- and framework-agnostic.
- `resolveSurfaceModules(active, surface, activation)` maps the active capabilities to their `{ specifier, exportName }` for a surface. It is the seam shared by the runtime loop (`composeCapabilities`) and by build-time hosts that code-generate static imports.

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
- **Build-time** — run `resolveSelectedCapabilities` + `resolveSurfaceModules` in
  a build step and code-generate _static_ imports. The injected set is fixed and
  auditable at build time, with no runtime discovery or dynamic `import()` —
  suited to bundled or air-gapped artifacts.

Both compose the identical set from one seam (`resolveSurfaceModules`). See
`snippets/buildtime-composition.ts` for the build-time manifest.

## Local Commands

```shell
cd packages/capability-composition
pnpm build
pnpm test
pnpm typecheck
pnpm package:check
```
