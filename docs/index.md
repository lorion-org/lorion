# LORION Package Docs

This is the public documentation entry point for LORION packages.
Package-level documentation lives in each package README under
`packages/<name>/`.

LORION is organized as a set of independent libraries and adapters. Core
packages stay framework-free, Node packages add server-side helpers, and
framework adapters compose those capabilities for runtimes such as Nuxt.

## Standards

- Packages solve one focused problem and can be adopted independently.
- Core packages stay framework-free; runtime-specific behavior lives in Node packages or framework adapters.
- Public APIs are small, explicit, and documented through checkable examples.
- Workspace checks cover build output, linting, tests, type checks, examples, dry-run package contents, and published package shape.

## Package Documentation

- [composition-graph](../packages/composition-graph/README.md)
- [descriptor-discovery](../packages/descriptor-discovery/README.md)
- [provider-selection](../packages/provider-selection/README.md)
- [registry-hub](../packages/registry-hub/README.md)
- [runtime-config](../packages/runtime-config/README.md)
- [runtime-config-node](../packages/runtime-config-node/README.md)
- [nuxt](../packages/nuxt/README.md)

## Documentation Model

- Workspace-level docs focus on public package behavior and package boundaries.
- Package-specific usage, examples, and API notes live in the package README.
- Adapter responsibilities live outside reusable core packages unless the package is explicitly a framework adapter.
- Publishable packages include built ESM/CJS/types output, README, LICENSE, and clean tarball contents.
