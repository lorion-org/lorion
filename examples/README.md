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
and `shop-coffee@2.0.0` from their regular capability directory, plus
`2.0.0-beta.1` and `3.0.0-beta.2` from separate `shop-coffee-beta-v2` and
`shop-coffee-beta-v3` directories. The packages
have distinct npm names; their capability id stays `shop-coffee`.

The normal profile includes a bare `shop-coffee` seed to retain stable selection
and selects v2, showing **Bean Supply Plus**.
The `storefront-legacy` bundle requires v1 and shows **Bean Supply**. Run either React
example with `LORION_FEATURES=storefront-legacy`, or Nuxt with
`LORION_CAPABILITIES=storefront-legacy`, prefixed to its command above. `/tech`
shows the resolved versions; `/shops/coffee` shows the selected implementation.
Only that version contributes a route and a shop registration. These profiles
exercise descriptor discovery, version constraints, physical source selection
and each adapter's activation path together.

Select `storefront-conflict` through the same environment variable to verify a
startup failure: its `2` requirement conflicts with the legacy
bundle's `1` requirement. Each example aborts with both requirements and the
available versions. JSON descriptors and bundle manifests accept the same npm
SemVer ranges as direct descriptor input.

A seed can select a version directly without adding a grouping. These commands
build each example with its existing older coffee implementation:

```shell
pnpm --filter @lorion-examples/react-loader build --features="storefront,shop-coffee@1"
pnpm --filter @lorion-examples/react-runtime build --features="storefront,shop-coffee@1"
pnpm --filter @lorion-examples/nuxt build --capabilities="default,shop-coffee@1"
```

Use the same arguments with `dev` to inspect `/shops/coffee` and `/tech`.
Replace `shop-coffee@1` with `shop-coffee@2` to select v2. The descriptor documents
store concrete SemVer versions (`1.0.0` and `2.0.0`); seeds and dependency maps use
the major ranges `1` and `2`. The shared web profile explicitly accepts both stable
majors and the two concrete beta versions. An ordinary `2` range does not admit
`2.0.0-beta.1`. Adding `shop-coffee@2` next to
`storefront-legacy` fails because the seed requires v2 and the grouping requires v1.
The loader example prints requested specifications, chosen versions, source paths
and their effective requirements from its single composition run. The shared
[selection contract](../packages/descriptor-selection/README.md#capability-versions)
owns range syntax, stable defaults and explicit prerelease opt-in.

### Named version selectors

Each host registers `beta` and `next` as predicates accepting candidates whose
first prerelease identifier is `beta`. The names are host configuration, not npm
registry tags. `next` demonstrates an alias whose name differs from its admitted
prerelease identifier. Each host's default selection includes bare `shop-coffee`
and therefore selects stable v2. An explicit `storefront` (React) or `default`
(Nuxt) request without that coffee seed permits the betas admitted by the web
dependency range; explicit selections replace the host default selection.

```shell
pnpm --filter @lorion-examples/react-loader dev --features="storefront,shop-coffee@beta"
pnpm --filter @lorion-examples/react-runtime dev --features="storefront,shop-coffee@beta"
pnpm --filter @lorion-examples/nuxt dev --capabilities="default,shop-coffee@beta"
```

These commands select `3.0.0-beta.2`, displaying **Bean Supply Beta 3** at
`/shops/coffee`. Replace `@beta` with `@next` for the same candidate set. Add
`,shop-coffee@^2.0.0-beta.0` to any selection to restrict it to
`2.0.0-beta.1`, displaying **Bean Supply Beta 2**. An active descriptor dependency
with the same range would impose the same restriction. No host preselects a version
before composition; the shared solver can try older eligible candidates.

Request `storefront-legacy,shop-coffee@beta` to observe a build/startup failure:
the channel admits only beta versions while the active legacy grouping requires
stable v1. Selection does not fall back to a stable candidate. The existing
composition reports retain the named request and the effective eligible versions.

Each host reads its own `version-policy.json` before composition:

```json
{
  "curated": [
    { "id": "shop-coffee", "version": "1.0.0" },
    { "id": "shop-coffee", "version": "2.0.0-beta.1" }
  ]
}
```

The host registers `curated` as a predicate matching both id and exact version.
This JSON shape belongs to the example host. Lorion receives the predicate through
its shared `versionSelectors` contract; it does not interpret the JSON or assign
meaning to `curated`.

```shell
pnpm --filter @lorion-examples/react-loader dev --features="storefront,shop-coffee@curated"
pnpm --filter @lorion-examples/react-runtime dev --features="storefront,shop-coffee@curated"
pnpm --filter @lorion-examples/nuxt dev --capabilities="default,shop-coffee@curated"
```

These commands select **Bean Supply Beta 2**. Stable v2 and Beta 3 are discovered
but not listed in the policy. Add `,shop-coffee@1` to select **Bean Supply** instead:
the exact allowed set and the major requirement intersect. This is a restriction,
not an ordered fallback. A selector admitting a stable version and a higher-major
beta does not prefer the stable version.

`/tech` shows the chosen version; `/shops/coffee` renders its implementation. The
React loader also prints the original request, eligible versions and physical
sources from its composition report. For example, `shop-coffee@curated` has eligible
versions `2.0.0-beta.1` and `1.0.0`; adding `shop-coffee@1` keeps that selector evidence
and adds the intersecting major requirement. Reports capture the result, not the
host's JSON policy or an executable replay configuration.

`pnpm examples:test` runs `beta`, `beta-compatible`, `beta-cli`, `curated` and
`curated-compatible` against built public exports in React Models A and B and Nuxt.
All three verify the chosen version and rendered shop. Model A and Nuxt additionally
check contribution provenance, checkout navigation and exclusion of unselected
implementations from bundles. All three builds reject the legacy/beta conflict.

## Composition-bound contribution playgrounds

React Model A and Nuxt opt into the same contribution contract. Shops publish typed
values at `shops/shop`; payment implementations contribute at `payments/payment-method`.
The existing provider selection result determines which checkout provider is used.
The collection does not choose another provider. Providers depend on checkout because their routes render its action surface.
The commerce/web grouping selects checkout;
Stripe is its `defaultFor` provider. Keeping Stripe out of explicit grouping membership lets
an explicit invoice seed override that default without two competing explicit providers. Model B continues to demonstrate an
independent host runtime.

Optional `gift-wrap` and `order-note` layers contribute ordinary components to
`checkout/actions`, receiving `shopId` through native props. The owner renders them in
explicit order, with native local click state, keyed identity and a fallback when empty.
React uses `ComponentType<CheckoutActionProps>`; Nuxt uses Vue
`DefineComponent<CheckoutActionProps, any>`, leaving setup bindings opaque while checking
required props. Both contracts reject components that require props the owner does not supply.
These layers have no required checkout dependency. Their public contract imports are
type-only, so an absent checkout implementation is not imported just to author an item.
These local capabilities are not workspace packages; their public contract files are
therefore imported by relative type-only paths and exposed through `./contracts`.

`/tech` displays structural contribution identities, addresses, order and active/inactive
status. It does not display payloads or private configuration. React's monitor route is
host-owned so it remains available without selecting the shop UI.

| Browser profile      | React selection                                         | Nuxt selection                                       | Expected observation                                       |
| -------------------- | ------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| `normal`             | `storefront,shop-coffee`                                | `default,shop-coffee`                                | Coffee v2 and stationery, Stripe checkout, action fallback |
| `actions`            | `storefront,shop-coffee,gift-wrap,order-note`           | `default,shop-coffee,gift-wrap,order-note`           | Two ordered, interactive checkout actions                  |
| `legacy`             | `storefront-legacy`                                     | `storefront-legacy`                                  | Coffee v1 route, item and provenance agree                 |
| `inactive`           | `gift-wrap` with commerce base omitted                  | `gift-wrap`                                          | Checkout stays absent; action is inspectable and inactive  |
| `invoice`            | `storefront,shop-coffee,payment-provider-invoice`       | `default,shop-coffee,payment-provider-invoice`       | The explicitly selected invoice provider owns checkout     |
| `legacy-cli`         | `storefront,shop-coffee@1`                              | `default,shop-coffee@1`                              | CLI selects coffee v1                                      |
| `beta`               | `storefront,shop-coffee@beta`                           | `default,shop-coffee@beta`                           | Selector admits both betas; Beta 3 wins                    |
| `beta-compatible`    | `storefront,shop-coffee@beta,shop-coffee@^2.0.0-beta.0` | `default,shop-coffee@beta,shop-coffee@^2.0.0-beta.0` | Range intersection selects Beta 2                          |
| `beta-cli`           | `storefront,shop-coffee@next`                           | `default,shop-coffee@next`                           | CLI alias selects Beta 3                                   |
| `curated`            | `storefront,shop-coffee@curated`                        | `default,shop-coffee@curated`                        | Caller-owned JSON membership selects Beta 2                |
| `curated-compatible` | `storefront,shop-coffee@curated,shop-coffee@1`          | `default,shop-coffee@curated,shop-coffee@1`          | Policy and range intersection selects v1                   |
| `provider-only`      | `payment-provider-stripe`                               | `payment-provider-stripe`                            | Provider dependency selects checkout and its fallback      |
| `failure-duplicate`  | `storefront,failure-duplicate`                          | `default,failure-duplicate`                          | Native startup rejects duplicate items                     |
| `failure-factory`    | `storefront,failure-factory`                            | `default,failure-factory`                            | Native startup reports a factory failure                   |

`LORION_FEATURES` selects React capabilities; `LORION_CAPABILITIES` selects Nuxt extensions.
The `legacy-cli` profile verifies the corresponding `--features` and `--capabilities`
arguments. React's `inactive` and `provider-only` test/demo profiles omit its otherwise
always-on commerce base so required descriptor dependencies determine the selected owners. This is host seed policy, not a runtime selection switch.
Create a new app composition to change a profile.

After `pnpm build` and `pnpm exec playwright install chromium`, run `pnpm examples:test`.
Playwright builds and serves React Model A and Nuxt using published `dist` exports,
with no source condition, and runs the same contribution assertions against each.
The named-selector profiles also build and serve Model B, which uses its host-owned
runtime and aliases the selected capability exports. The command runs every profile
in the table sequentially using Playwright's native web-server lifecycle, then checks
all three builds reject the legacy/beta conflict and Nuxt's CLI/environment requests
reject conflicting version requirements.
For one profile, set `LORION_EXAMPLE_PROFILE=actions` and run
`pnpm exec playwright test --config examples/playwright.config.ts`.

The browser suite checks selection, route/item consistency, provider identity, ordering,
props, interaction, unmount/reset and Nuxt SSR/hydration, including warning and error
console messages. Failure profiles require structural error codes and no mounted application.
Nuxt exposes test diagnostics through a test-only `app:error` observer; its production SSR
error page must exclude private fixture values. These profiles opt into fixture descriptors
and the observer; normal example selections do not include them. Core and adapter fixtures cover
invalid identities, undeclared addresses, duplicate items, missing point implementations,
factory failure and malformed inputs. Nuxt's integration suite additionally mutates a
factory-created payload in parallel SSR requests to detect shared request state.
