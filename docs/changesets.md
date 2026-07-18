# Changesets

LORION uses Changesets to describe release-impacting package changes before the
public repository publishes a new version.

## Commit Rule

Every commit that changes a publishable package's public API or runtime behavior
must include the matching Changeset in the same commit.

This keeps reviews honest: the code change, version impact, and release note are
reviewed together.

## When To Add One

Add a Changeset when a commit changes a publishable package in one of these ways:

- adds, removes, renames, or changes public exports
- changes runtime behavior visible to package consumers
- changes configuration shape or defaults
- changes generated artifacts or adapter behavior that consumers rely on
- fixes a bug in published package behavior

Usually do not add a Changeset for:

- tests only
- documentation only
- internal refactors with no consumer-visible behavior change
- non-publishable workspace tooling

If a change is ambiguous, prefer adding a small patch Changeset and explain the
consumer-visible effect.

## File Shape

Create one new Markdown file per thematic release-impacting commit under
`.changeset/`.

Do not append unrelated changes to an existing Changeset file.

A single Changeset file may cover multiple packages when the commit is one
coherent topic:

```md
---
'@lorion-org/nuxt': minor
'@lorion-org/react': minor
---

Align provider relation handling across framework adapters.
```

Use a new file for a later commit with a new topic. Update an existing uncommitted
Changeset only when the code change is still the same topic.

## Version Level

Use the smallest version level that honestly describes the consumer impact:

- `patch`: bug fix or compatible behavior correction
- `minor`: new public API, new supported config, or compatible capability
- `major`: breaking public API, config, behavior, or package contract

For pre-1.0 packages, still choose the level by semantic intent so release notes
remain understandable.

## Package Selection

List every publishable package whose public API or runtime behavior changes.

Examples:

- Runtime-safe Nuxt subpath added: `@lorion-org/nuxt` gets `minor`.
- Shared graph helper added and used by adapters: `@lorion-org/composition-graph`
  gets `minor`; adapter packages get a Changeset only if their public behavior
  also changes.
- README-only correction: no Changeset.

## Workflow

Before committing a release-impacting Lorion change:

1. Stage only the thematic package changes.
2. Add or update the matching `.changeset/*.md` file for that same theme.
3. Run targeted checks for each affected package.
4. Review `git diff --cached` and verify the Changeset matches the staged code.
5. Commit the package change and Changeset together.

Never create one large end-of-branch Changeset that summarizes unrelated commits.
