---
'@lorion-org/composition-graph': minor
---

Match an explicit `cliKeys` entry in its prefixed form as well. `cliKeys: ['features']` previously looked for a bare `features=…` argv token and therefore matched nothing, while `key: 'features'` was prefixed to `--features`. A host reaching for `cliKeys` first hit the silent form, as Lorion's own React examples did. Entries are now tried as written and, when they carry no leading dash, also as `--<entry>`, so anything that matched before keeps matching. The prefixed spelling is tried first, so a positional argument equal to the bare key cannot outrank the flag and consume the token after it.
