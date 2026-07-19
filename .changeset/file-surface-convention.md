---
'@lorion-org/surface-activation': minor
---

Add `fileSurfaceConvention({ files, exportSubpath, exportSuffix?, exists, join? })`, a ready-made `SurfaceConvention` for the common file-layout case: the surface is present when one of `files` exists, and its export is `camelCase(id) + exportSuffix` from `exportSubpath`. It bakes the marker and export-name rule a host would otherwise repeat per surface. Existence is injected (`exists`), so the package stays I/O-free; `join` defaults to a POSIX join. The raw `SurfaceConvention` object stays available for cases the preset does not cover.
