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

All three examples expose the same provider-slot outcome on `/tech`: selected
providers, all candidates, and active slots that intentionally remain unfilled.
Nuxt reads it from public runtime config; both React models read the identical
`providerSelection` structure from `virtual:capabilities`.

## Selecting a capability version

All three examples discover `shop-coffee@1.0.0` from `prototypes/shop-coffee`
and `shop-coffee@1.1.0` from their regular capability directory. The packages
have distinct npm names; their capability id stays `shop-coffee`.

The normal profile selects 1.1.0 and shows **Bean Supply Plus**. The
`storefront-legacy` bundle pins 1.0.0 and shows **Bean Supply**. Run either React
example with `LORION_FEATURES=storefront-legacy`, or Nuxt with
`LORION_CAPABILITIES=storefront-legacy`, prefixed to its command above. `/tech`
shows the resolved versions; `/shops/coffee` shows the selected implementation.
Only that version contributes a route and a shop registration. These profiles
exercise descriptor discovery, version constraints, physical source selection
and each adapter's activation path together.

Select `storefront-conflict` through the same environment variable to verify a
startup failure: its `>=1.1.0 <2.0.0` requirement conflicts with the legacy
bundle's exact `1.0.0` pin. Each example aborts with both requirements and the
available versions. JSON descriptors and bundle manifests accept the same npm
SemVer ranges as direct descriptor input.
