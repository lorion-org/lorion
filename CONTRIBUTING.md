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
- `pnpm examples:check` type-checks runnable examples
- `pnpm package:check` validates package contents and publish shape
- `pnpm check` runs the full local gate used by CI

## Release model

- package versions are managed with Changesets
- npm publishing is done from GitHub Actions
- all publishable packages must define `exports`, `types`, and `files`
