# Roadmap and stability

LORION is published under the `1.0.0-beta.x` line. This page states how versions
behave today and what has to be true before a stable `1.0.0`.

## Stability policy

- During `1.0.0-beta.x`, public APIs may change between beta releases. Every
  release-impacting change is recorded in a changeset, so the changelog is the
  source of truth for what moved.
- From `1.0.0`, the packages follow semantic versioning: breaking changes land
  only in a major release, features in minors, fixes in patches.
- Core packages stay framework-free. Framework-specific behavior lives in the
  adapters, so a breaking change in one adapter does not force a major across the
  core.

## Road to 1.0

`1.0.0` is not a date. It ships once the ecosystem is proven end to end:

- [ ] Public APIs of the core packages (`capability-composition`,
      `composition-graph`, `descriptor-discovery`, `descriptor-selection`,
      `provider-selection`, `runtime-config`) hold steady across a full beta cycle
      with no pending breaking changes.
- [ ] Both framework adapters (`react`, `nuxt`) are proven by a complete,
      working integration in a production application, not only in playgrounds.
- [ ] Documentation covers the descriptor, selection, and provider model and both
      React consumption models (composition runtime and capability loader).
- [ ] Packaging gates stay green: `publint`, types resolve across module
      resolvers (`attw`), and the playgrounds build in CI.

The proven production integration is the gating signal: a stable `1.0.0` follows
a real deployment that exercises selection, provider resolution, activation, and
graph-only dependencies together.

## Support matrix

| Area          | Supported                                       |
| ------------- | ----------------------------------------------- |
| Node.js       | 20.19+ or 22.12+                                |
| Module format | ESM-first, dual ESM/CJS output, bundled types   |
| React adapter | React `^19`, Vite `^7`                          |
| Nuxt adapter  | see the peer dependencies of `@lorion-org/nuxt` |

Older module resolvers (`node10`, legacy `main`-field resolution) are not a
support target: subpath exports require an `exports`-aware resolver.
