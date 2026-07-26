---
'@lorion-org/capability-composition': patch
---

Let Changesets own the npm dist-tag.

The release workflow set `NPM_CONFIG_TAG=beta` and the docs said prereleases therefore land on the `beta` tag instead of `latest`. Neither held: `changeset publish` computes the tag and passes it to npm as an explicit `--tag`, which wins over npm config, and while a package has no stable release it deliberately publishes to `latest` so a plain install resolves. The result was a `beta` tag pointing at an older version than `latest`, which is the opposite of what a consumer expects from a prerelease channel. The workflow now sets no tag and the release documentation states what actually happens.
