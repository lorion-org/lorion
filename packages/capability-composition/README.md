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
- `composeCapabilities({ seed, surface, activation, load, register })` resolves the active set and, for each capability that provides the surface, loads its module and hands the exported value to the host's registration. Registry- and framework-agnostic.

## What It Is Not

- not a framework runtime or plugin registry
- not a bundler or a router
- not an application naming convention

## Local Commands

```shell
cd packages/capability-composition
pnpm build
pnpm typecheck
pnpm package:check
```
