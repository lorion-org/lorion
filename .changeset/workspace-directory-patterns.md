---
'@lorion-org/descriptor-discovery': patch
---

Use tinyglobby for workspace package-directory patterns, including recursive globs,
braces and exclusions. Apply exclusions to orphan-descriptor checks as well. Reject
missing external checkouts named by literal positive patterns as well as glob prefixes.
