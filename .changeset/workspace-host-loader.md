---
'@lorion-org/capability-composition': minor
'@lorion-org/descriptor-discovery': minor
---

Add a batteries-included workspace loader so a Node/Bun runtime host needs no bespoke plumbing to satisfy `composeCapabilities`' `load` callback:

- `createWorkspaceLoad({ workspaceRoot, packagesDir? })` in `@lorion-org/capability-composition`: builds a `load` callback that imports a workspace package from `<workspaceRoot>/<packagesDir>/<folder>` through its declared `exports` (a string target, a subpath map, or the conditions-only `.` sugar, with conditional objects resolved in `import` > `require` > `default` order; the `types` condition is never followed, and a specifier/target that escapes the packages directory is rejected). `packagesDir` defaults to `'packages'`. It is the runtime counterpart to build-time workspace source aliases and carries no product specifics.
- `resolveWorkspaceRoot(from, { markers? })` in `@lorion-org/capability-composition`: walks up from `from` (a file URL such as `import.meta.url`, or a path) until a directory holds all `markers` (default `['packages']`), throwing a clear error otherwise.
- `findUp(fromDir, matches)` in `@lorion-org/descriptor-discovery`: the shared upward-directory-walk primitive now backing manifest discovery and workspace-root resolution, so the ascent is defined once instead of re-implemented per host.
