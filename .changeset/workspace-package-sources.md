---
'@lorion-org/descriptor-discovery': minor
'@lorion-org/capability-composition': minor
---

Read the package set of a workspace once, and compose from it.

- `resolvePackageSources({ from | root, patterns?, additionalRoots?, descriptorFileName?, cache? })`
  in `@lorion-org/descriptor-discovery`: the packages a workspace holds, each with its
  name, root, manifest and the descriptor beside it, plus the `descriptorPaths`
  `discoverDescriptors` takes. Workspace patterns are read in both spellings (a list,
  or an object carrying `packages`), `additionalRoots` joins further checkouts into
  one snapshot with the asking workspace winning a name collision, two packages
  claiming one descriptor id abort with both paths, a descriptor with no manifest
  beside it is named rather than dropped, and a pattern whose prefix names a checkout
  that is not there aborts instead of resolving a composition that is quietly
  incomplete. `findWorkspaceRoot(from)` and `readWorkspacePatterns(manifest)`
  are the pieces it is built from.
- `resolvePackageExport(exports, subpath)` and `resolvePackageEntries(packageSources, subpaths)`
  in `@lorion-org/descriptor-discovery`: one `exports` resolution (`import` before
  `require` before `default`, conditions-only shorthand included, `types` never
  followed), and the public entries of a package set projected onto the files they
  resolve to. `createWorkspaceLoad` now uses that resolution instead of a second copy
  of it.
- `createPackageSourceLoad(packageSources)` in `@lorion-org/capability-composition`:
  the `load` callback over a resolved package set rather than one packages directory,
  so packages of several roots and several directory layouts load through one
  callback.
- `resolveSurfaceEntries({ capabilities, surface, activation, packageSources })` in
  `@lorion-org/capability-composition`: one surface projected onto the files its
  packages declare, for a build-time host that emits static imports. A capability
  whose package is missing from the set, declares no such export, or exports a file
  that is not there aborts by name.
