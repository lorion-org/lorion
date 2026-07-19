---
'@lorion-org/descriptor-discovery': minor
---

Add `requirePackageName(packageJson, packageJsonPath)` — validate that an on-disk capability package declares a string `name`, with one shared error message. `@lorion-org/capability-composition` and `@lorion-org/react` now use it instead of each reimplementing the read-and-validate, removing the duplicated logic (and a redundant second validation in the React Vite plugin's activation resolver).
