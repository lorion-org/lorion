---
'@lorion-org/descriptor-discovery': patch
---

Match a file at the end of a descriptor path pattern, whatever the last segment is.

A pattern ending in a wildcard already matched files only. A pattern ending in a
literal segment asked whether the path exists, so a directory carrying the name of
the descriptor file counted as a match and the read that followed failed with
`EISDIR` instead of saying what was wrong. Both branches now name a file.
