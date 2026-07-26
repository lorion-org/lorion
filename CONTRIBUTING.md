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
- `pnpm changeset` records a release note for a package change
- `pnpm check` runs the full local gate used by CI

## Public API surface

A symbol reachable from an entry point in a package's `exports` map is public,
whatever the intent behind it, and adding or removing one is a public change that
needs a changeset.

- Something that should not be part of the contract lives in a module the exports
  map does not name, and the tests import it from there.
- A package README states what the exported symbols are for, which invariants hold
  and where the seams are. It does not enumerate them: the exports map and the
  sources are the inventory, and a list kept in prose goes stale silently.

Nothing verifies today that a version bump matches what actually changed. That gap
is tracked in #9.

## Release model

- package versions are managed with Changesets
- npm publishing is done from GitHub Actions
- all publishable packages must define `exports`, `types`, and `files`
- release-impacting package changes must include their Changeset in the same commit
- a brand-new package needs one manual first publish (`npm publish --access public --tag beta` from its directory), then an npm Trusted Publisher (`lorion-org` / `lorion` / `release.yml`, action `npm publish`); OIDC cannot bootstrap a name that does not exist yet, so CI (which fails with `E404`) only takes over from the next release
- see [the release workflow](./docs/release.md) for the maintainer flow
