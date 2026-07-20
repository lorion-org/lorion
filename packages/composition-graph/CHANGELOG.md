# @lorion-org/composition-graph

## 1.0.0-beta.5

### Patch Changes

- 5246ab8: Adopt unified versioning: all `@lorion-org/*` packages now share a single version and are released together, so a given release line is consistent across the whole surface.

## 1.0.0-beta.2

### Minor Changes

- ac3c152: Add descriptor selection seed normalization for CLI, environment, and default host inputs.
- ac3c152: Prefer explicitly selected provider descriptors over descriptor-level provider preferences and defaults, and expose a Lorion source export condition for workspace playground development.
- ac3c152: Add shared capability selection seed defaults for framework adapters.

## 1.0.0

### Minor Changes

- 23a50f0: Introduce the first framework-free `composition-graph` package with generic descriptor, relation, catalog, and composition primitives.

  The package now provides deterministic descriptor catalogs, relation graph helpers, selection resolution with provenance, base descriptor support, provider relation fields, and package examples for deployment composition flows.

## 1.0.0-beta.0

- Initial beta package.
