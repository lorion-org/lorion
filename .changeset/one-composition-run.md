---
'@lorion-org/capability-composition': minor
'@lorion-org/descriptor-selection': minor
---

State a composition run once, and let every projection read that one resolution.

- `createCompositionRun(input)` resolves on first use and reuses the result for the
  report, the origins, the package sources it selected, the surface projection and
  the runtime composition. A host that resolves per entry point states its run twice,
  and the second statement is free to differ: a build then emits one selection while
  the server start reports another, and nothing in either says so.
- `resolveCapabilitySelection` additionally returns `discoveredDescriptors`, the
  descriptors behind the ids it already reported. A report that says why a descriptor
  is in a composition needs the ones that are not, above all the providers that lost
  a slot, and reading the workspace a second time would answer for a different one.
- `resolveRequestedSelection(seed)` in `@lorion-org/descriptor-selection` returns the ids a
  run named, or null when it named none, and `resolveDescriptorSelection` now falls back
  to `defaultSelection` on top of it. A report says what was asked for, and a run that
  named nothing is a different statement than one that named what its host defaults to.
- `describeCompositionOrigins(input)` and `formatCompositionOrigins(origins)` sort one
  resolution into where each descriptor came from: named by the run, from the base,
  from a grouping it runs, a slot filling with the candidates it beat, brought by a
  grouping, or pulled in behind something named.
