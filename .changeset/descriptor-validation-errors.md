---
'@lorion-org/descriptor-discovery': major
---

Report every schema violation of a descriptor, not the first one.

Validation stopped at the first error, so a descriptor with three broken fields took three runs to fix. It now collects all of them in one pass, and the formatter that a host can replace receives all of them.

- `DescriptorSchemaValidationErrorFormatter` takes `(target, validationErrors)`, a non-empty readonly array, where it took a single `ErrorObject`. A host with its own `formatError` reads `validationErrors[0]` for the previous behaviour, or maps over the array.
- The default message lists one line per violation, so the text of an existing message changes even for a single error. A test asserting the exact string needs updating; one matching the offending key keeps working.
- `DescriptorValidationOptions` takes `label`, what the validated document is called in the message. A manifest wrapper is not a descriptor, and saying so is the difference between a reader looking at the file and a reader looking at a bundle entry. It defaults to `Descriptor`.
- `NESTED_DESCRIPTOR_FIELD` is exported, the field name (`bundles`) that discovery expands into nested descriptors. A host that passes `nestedField` explicitly can name the default instead of repeating the literal.
