---
'@lorion-org/capability-composition': minor
'@lorion-org/nuxt': minor
'@lorion-org/react': minor
---

Describe and render a composition, once, for every host.

Only the Nuxt adapter could report on a resolution; a build-time host had nothing and wrote its own. Two independent formatters then described the same resolution, and a third host would have written a third — the shape that let a loader compose 50 capabilities while the report said 47.

- `describeComposition({ resolved, discovered, requested?, selected?, base?, providers? })` returns a `CompositionReport`, stated in descriptor ids alone: what was asked for, what the selection resolved to, the always-on base, the winner and mode of each contested capability, the activated set and everything discovery found. Whether a descriptor is a package on disk, a mounted layer or a manifest grouping is a host's own view, so a host that reports on that filters before it describes. Every id list is deduplicated and sorted, so two reports of one run compare as equal text.
- `discovered` is required. Defaulting it to `resolved` would make the `n/m` count claim that nothing was left out, which is the failure the report exists to prevent.
- A provider entry carries `resolved`. A winner that is not part of the composition is reported as such rather than dropped: dropping it hides a host that configured a provider the run never built.
- `notResolved(report)` names what the workspace holds and this composition leaves out.
- `formatCompositionReport(report, { palette?, width?, leadingRows? })` renders it as lines: an aligned key column for what was asked and what won each contested capability, then one hanging block per descriptor set, hard-wrapped so a terminal never soft-wraps it. Colour stays with the host through the palette, which names one role per thing a reader distinguishes (`label`, `accent`, `id`, `muted`), and `leadingRows` lets a host add its own rows to the same key column.
- `resolveCapabilitySelection` additionally returns `discovered`, every descriptor id the run knew about. Counting directories instead misses nested descriptors and manifest groupings.
- `formatNuxtExtensionBootstrapLog` renders that shared report, so the Nuxt adapter is a renderer rather than the only host with a reporter. Its output is a block of aligned rows where it was one line per fact, so a snapshot of it needs updating. `NuxtExtensionBootstrap` gains `requestedExtensions`, the ids a run asked for or null when it took the default, which the log reports instead of always claiming the default selection.
- `describeCapabilityComposition(workspaceRoot, options)` is the build-time equal in `@lorion-org/react/vite`: it resolves the loader's own options and returns the same `CompositionReport`, groupings and provider outcome included. A React host can now report on a composition without rebuilding the resolution, which only the Nuxt adapter could do.
