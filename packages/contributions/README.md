# Composition-bound contributions

This framework-free package collects typed values from independent selected layers.
A point is addressed by its owner ID and point name. The descriptor graph owns the
vocabulary and relations; `projectContributionPlan` in capability-composition projects
that graph's selected exact versions into a serializable runtime plan.

The host supplies that plan and the selected modules to `createContributionRuntime`.
Each synchronous `create()` factory returns its own point declarations and contributions.
The runtime checks all module identities before invoking any factory, collects all
points before validating contributions, then publishes one complete immutable structural
snapshot. A failure throws `ContributionError`; no partial runtime is returned.

```ts
import { defineContributionPoint, defineContribution } from '@lorion-org/contributions';

type Action = { label: string };
const actions = defineContributionPoint<Action>({ owner: 'checkout', point: 'actions' });
const contribution = defineContribution(actions, [
  { id: 'gift-wrap', order: 10, value: { label: 'Gift wrap' } },
]);
```

A typed point reference does not register a point. Only the owning module declares it
in `points`. Contributors import the owner's public contract with `import type`, then
create their own reference to the same address. They need no runtime import of that
owner. TypeScript checks payload compatibility; arbitrary payloads are opaque at runtime.
Expose these contract types through an ordinary package `./contracts` export. Multiple
selectable owner versions must preserve a point's payload contract; use a new point name
or a required dependency constraint for incompatible contracts. Runtime version selection
does not switch TypeScript declarations.

## Collection rules

- A descriptor-declared contribution to a known, unselected owner is inactive. It
  does not select its owner and appears only in `inspect()` as `owner-not-selected`.
- An undeclared relation or a selected recipient lacking an addressed implementation
  fails. Empty declared contributions need no implementation until an item is supplied.
- Active item IDs are unique per address across contributors. Duplicates fail instead
  of overwriting. The same ID at different addresses is valid. Inactive duplicates
  remain inspectable and do not conflict with an active collection.
- Order is finite numeric `order` (default `0`), contributor ID, then item ID. String
  comparisons use code units and are independent of locale or discovery order.
- `get(point)` returns a stable readonly array; an empty or unknown lookup returns an
  empty array. `inspect()` returns identities, addresses, IDs, order and activation
  status without payloads, paths or configuration.

Envelopes, arrays, addresses and identities are copied and frozen. Payloads are not
cloned or frozen: components and functions remain ordinary values. Factories must create
fresh mutable payloads for each application or SSR request. Factories are synchronous,
pure declaration constructors, with no resource acquisition or lifecycle side effects.
An async return fails, and its rejection is consumed. The original factory error is
available as the non-enumerable `cause`; public messages and structural details do not
copy its contents. Invalid-item details include `itemId` when the item has a valid
nonempty string ID. Applications decide whether and where to log that cause.

## Ownership

This package does not select versions or providers, render components, manage events,
assemble dependency injection, or hot-switch a running composition. Create a fresh runtime
for a new composition. Hosts use framework-native context, rendering and lifecycle.
React and Nuxt opt into their respective Lorion bindings; custom hosts can consume the
same plan and module contract directly. Existing registry-hub overwrite behavior and
React's legacy contribution API remain independent and unchanged.
