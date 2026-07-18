# playground-server

Proof that one framework-free core serves **both** server integration styles —
runtime and build-time — from the same descriptor selection.

Both styles share one brain (`src/composition.mjs`: the same seed, surface
convention, and registry). They differ only in **when** composition runs and
**how** the module is loaded:

|                    | Runtime host                         | Build-time host                                                    |
| ------------------ | ------------------------------------ | ------------------------------------------------------------------ |
| Entry              | `src/server.runtime.mjs`             | `src/build.mjs` → `src/server.buildtime.mjs`                       |
| Composes           | at boot (`composeCapabilities`)      | at build (`resolveSelectedCapabilities` + `resolveSurfaceModules`) |
| Loads              | dynamic `import(specifier)`          | code-generated **static** imports                                  |
| Injected set known | at boot (disk scan)                  | at build (in the generated file)                                   |
| Good for           | a source-run server that starts once | a bundled or air-gap artifact, statically auditable                |

Both call the same `resolveSurfaceModules` seam, so the composed set is identical
— `src/proof.mjs` asserts it.

```shell
pnpm build                          # build the core first

pnpm --filter @lorion-org/capability-composition playground:server           # proof: both paths agree
pnpm --filter @lorion-org/capability-composition playground:server:runtime   # runtime host only
pnpm --filter @lorion-org/capability-composition playground:server:buildtime # build-time host only

# add a feature and swap the auth provider — the injected set changes the same way in both paths:
LORION_FEATURES="dashboard reports auth-oidc" pnpm --filter @lorion-org/capability-composition playground:server
```

`src/capabilities.generated.mjs` is produced by the build step and git-ignored.
