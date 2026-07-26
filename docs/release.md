# Release Workflow

LORION publishes `@lorion-org/*` packages from this public repository with
Changesets and GitHub Actions.

## Release Source

- The public `lorion-org/lorion` repository is the source of truth for package
  versions, changelogs, and npm publishing.
- Do not publish LORION packages from private downstream repositories.
- Downstream projects should test against this checkout through workspace links,
  source conditions, or packed packages before a release is cut.

## Contributor Flow

1. Make the package change.
2. Add focused tests, examples, and README updates when public behavior changes.
3. Add a matching Changeset with `pnpm changeset` for public API or runtime
   behavior changes.
4. Run targeted package checks first, then `pnpm check` when the change is ready.
5. Commit the code, docs, tests, and Changeset for the same topic together.

Documentation-only and tooling-only changes usually do not need a Changeset.

## Maintainer Flow

1. Merge package changes with their Changesets into `main`.
2. The Release workflow runs on `main`.
3. When unreleased Changesets exist, `changesets/action` opens or updates the
   version PR.
4. Review the version PR for package versions, internal dependency ranges,
   changelogs, and removed Changeset files.
5. Merge the version PR.
6. The next Release workflow run publishes the changed public packages to npm
   with provenance.

## Dist-Tags

Changesets owns the npm dist-tag and passes it to npm explicitly, so the workflow
sets none. While a package has no stable release yet, Changesets publishes its
prereleases to `latest`, so a plain `npm install @lorion-org/<package>` resolves to
the current prerelease. Once a stable version exists, prereleases move to the pre
tag from `.changeset/pre.json` and `latest` follows the stable line.

A consumer that wants a specific prerelease pins the exact version rather than a
dist-tag, because which tag carries a prerelease depends on whether that package
has had a stable release.

Changesets pre mode is active for the `beta` tag in `.changeset/pre.json`.
While it is active, `pnpm version-packages` creates prerelease package versions
such as `1.0.0-beta.2` instead of stable versions such as `1.0.0`.

To prepare the stable release path later:

```shell
pnpm changeset pre exit
```

Then review the pending version PR before merging it.

## Required GitHub/Npm Setup

- Each publishable `@lorion-org/*` package must configure npm Trusted
  Publishing for GitHub Actions:
  - repository: `lorion-org/lorion`
  - workflow filename: `release.yml`
- The workflow has `id-token: write` so npm can authenticate the publish through
  OIDC.
- The Release workflow uses Node 24 so the bundled npm CLI supports trusted
  publishing.
- Package manifests must keep `publishConfig.access` set to `public`.
- For maximum security after Trusted Publishing is configured on npm, choose
  "Require two-factor authentication and disallow tokens" under each package's
  publishing access settings.

## Local Commands

```shell
pnpm changeset
pnpm release:status
pnpm version-packages
pnpm check
pnpm release
```

Run `pnpm version-packages` and `pnpm release` locally only for inspection or
emergency maintenance. Normal releases happen in GitHub Actions.
