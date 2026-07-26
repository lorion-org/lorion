---
'@lorion-org/descriptor-discovery': major
---

Hold a manifest bundle to the same schema as the same grouping declared inside a descriptor.

`loadBundleManifest` defaulted a missing `version` to `0.0.0` before validating, while the identical grouping under a descriptor's `bundles` field was validated as written and rejected. One spelling accepted what the other refused. Manifest entries are now validated unchanged, so `version` is required in both, as `descriptor.schema.json` says.
