# examples

Runnable integration examples — the same reference app on different technical
foundations. `react-runtime` (Model A: capability runtime + file-based routing),
`react-loader` (Model B: capability loader + host-owned runtime), and `nuxt`
(module + layer extensions) all present the same shop app — same pages, texts, and
links; only the underbau differs.

- `react-runtime/` — React, Model A: `lorionReact()` (capability runtime + file-based routing)
- `react-loader/` — React, Model B: `capabilityLoader()` + a host-owned runtime
- `nuxt/` — Nuxt module + layer extensions

Run one from the workspace root:

```shell
pnpm --filter @lorion-examples/react-runtime dev
pnpm --filter @lorion-examples/react-loader dev
pnpm --filter @lorion-examples/nuxt dev
```

Each example is a private workspace package that depends on the relevant adapter
(`@lorion-org/react` / `@lorion-org/nuxt`; `react-loader` also uses
`@lorion-org/surface-activation` directly for the surface convention) and reuses
that adapter's capability format. Because the on-disk artifacts differ per
framework and composition model, each example owns its own capability set rather
than sharing one pool.

## Naming

Three namespaces appear in this repo, each with one clear meaning:

- `@lorion-org/*` — the real, published framework packages.
- `@lorion-examples/*` — the runnable example apps in this directory (private, unpublished).
- `@acme/*` — the demo **capability** packages consumed inside an example
  (`react-runtime` and `react-loader` register them via package name).

The React examples name their capability packages under `@acme/*` on purpose.
`@acme` is the established open-source placeholder for "your organization," so it
reads unambiguously as _a consuming product's own capability packages_ — the
thing these examples model — and can never be mistaken for a published
`@lorion-org/*` package. Both React examples use the same scope because they
model the same fictional consumer's capability packages, not two different
vendors. Contract ids follow the same convention (`acme.*`). The Nuxt example
needs no scope: Nuxt layers are directories, not npm packages.
