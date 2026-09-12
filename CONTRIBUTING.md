# Contributing

## Principles

- keep packages small and composable
- keep framework-free logic separate from framework bindings
- avoid application-specific naming in public APIs
- preserve behavior with tests when changing internals

## Development flow

1. add or update tests for behavior changes
2. keep changes scoped to one package boundary at a time
3. document public API changes in a changeset
4. prefer additive API evolution unless a breaking change is intentional and documented

## Local commands

```shell
pnpm install
pnpm check
```

Run commands from the LORION repository root:

- `pnpm prettier` checks formatting with Prettier
- `pnpm prettier:fix` formats files with Prettier
- `pnpm eslint` runs ESLint
- `pnpm eslint:fix` runs ESLint with autofix enabled
- `pnpm tsc` runs TypeScript checks
- `pnpm test` runs the test suite
- `pnpm tests` is an alias for `pnpm test`
- `pnpm snippets:check` type-checks the per-package doc snippets (`packages/*/snippets/`)
- `pnpm examples:verify` type-checks and builds the runnable example apps (`examples/`)
- `pnpm package:check` validates package contents and publish shape
- `pnpm attw` verifies published types resolve across module resolvers
- `pnpm mutants <source.ts>` measures test effectiveness for one source file: it
  mutates that file and reports every mutant no test noticed. A survivor is a finding
  to answer, not a gate, so the command reports and does not fail on one. It pairs a
  file with its colocated spec, or with the package's entry spec when there is none;
  `--tests <spec.ts>` names one instead. One file and one spec per run, because the
  Vitest runner yields the result of a single spec when several are named.
- `pnpm api` builds packages and updates their committed API reports
- `pnpm api:check` builds packages and checks those reports without updating them
- `pnpm api:test` tests API drift detection, also included in `pnpm test`
- `pnpm changeset` records a release note for a package change
- `pnpm check` runs the full local gate used by CI

## Fresh-install verification

Changes to dependencies, build tooling, declaration generation or verification
commands require verification from a fresh source tree containing the complete
proposed change.

Run `pnpm install --frozen-lockfile` and `pnpm check` without pre-existing
`node_modules`, generated outputs or Turbo task caches. The package download cache
may be reused.

Record the checked revision or patch, commands and results in the PR validation
section. Checks against previously generated declarations establish report
consistency, not build reproducibility.

Before declaring a PR ready to merge, confirm successful CI for its latest revision.

## Public API surface

A symbol reachable from an entry point in a package's `exports` map is public,
whatever the intent behind it, and adding or removing one is a public change that
needs a changeset.

- Something that should not be part of the contract lives in a module the exports
  map does not name, and the tests import it from there.
- A package README states what the exported symbols are for, which invariants hold
  and where the seams are. It does not enumerate them: the exports map and the
  sources are the inventory, and a list kept in prose goes stale silently.

### Reviewing API changes

When a package's public types or export map change, run `pnpm api` from the
repository root and include the generated [API reports](./api/) in the change.
Review the report diff before choosing the Changeset bump. The report records
signatures; runtime behavior changes still need behavioral tests and release notes.
The bump remains a human decision. Updating a report accepts a new baseline; a
passing check does not establish backward compatibility.

API Extractor does not preserve value-versus-type-only re-exports or module
augmentations. When changing either, review the emitted declarations and maintain
consumer assertions in `tools/dist-consumer/src/`. `pnpm declarations:check` checks
those assertions against published types in both module resolutions, including
consumer-file diagnostics. The assertions exercise the exported validator class
and the Nuxt configuration augmentation; they are not an exhaustive API inventory.
Dependency version changes and runtime export routing also require review of the
package manifest and the existing package/resolver checks.

[`api-extractor.json`](./api-extractor.json) owns the shared API Extractor settings.
`tools/api-reports.mjs` discovers public packages and their declaration targets
from `packages/*/package.json`, then invokes API Extractor once per exported type
branch. API Extractor owns the report format, writing and comparison. Report names
identify the package, export subpath and type conditions; ESM and CommonJS have
separate reports even when their signatures match. Published declarations are not
modified by report generation.

The reports cover literal export subpaths with `types` targets under `dist/`,
including `.d.ts`, `.d.mts` and `.d.cts`, with `import`, `require` and `default`
conditions. Runtime branches must have an explicit declaration target in their
branch or a shared enclosing `types` string; `types` must precede runtime
conditions. Implicit declaration fallback is rejected. Conditional objects under
`types` can describe type branches but do not cover sibling runtime branches.
The `lorion-source` condition is excluded from declaration analysis.
API Extractor expands `@lorion-org/*` against each package's declared dependencies
and includes their referenced types. Other dependencies retain imports; workspace
packages also have their own reports. Unsupported export shapes or
missing declarations fail rather than silently dropping an entry point. When
introducing another export shape, extend the discovery tests in the same change.

`pnpm api` uses API Extractor's local mode to update reports. `pnpm api:check` uses
its production mode, which fails on missing or changed reports and leaves generated
candidates in `.artifacts/api/`. The repository runner also rejects reports that
no longer correspond to an exported type branch; `pnpm api` removes them after
successful analysis. Suppressed forgotten-export diagnostics are also excluded
from report text so checkout paths cannot enter the baseline through those warnings.
Generated reports are excluded from formatting; regenerate them through the command
instead of editing them. The check runs in `pnpm check`
and CI alongside the existing declaration and package checks. Compiler diagnostics
in third-party declarations are filtered consistently with the declaration gate;
errors in Lorion declarations fail API analysis.

## Release model

- package versions are managed with Changesets
- npm publishing is done from GitHub Actions
- all publishable packages must define `exports`, `types`, and `files`
- release-impacting package changes must include their Changeset in the same commit
- a brand-new package needs one manual first publish (`npm publish --access public --tag beta` from its directory), then an npm Trusted Publisher (`lorion-org` / `lorion` / `release.yml`, action `npm publish`); OIDC cannot bootstrap a name that does not exist yet, so CI (which fails with `E404`) only takes over from the next release
- see [the release workflow](./docs/release.md) for the maintainer flow
