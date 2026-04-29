# @lorion-org/runtime-config-node

Node-side runtime-config loaders and path conventions.

It stays generic: directories are scopes, files are fragments, and loaded values
use the contracts from `@lorion-org/runtime-config`.

## Install

```shell
pnpm add @lorion-org/runtime-config-node @lorion-org/runtime-config
```

## What it is

- path helpers for runtime-config directories
- a JSON fragment loader for one scope
- a tree loader for all scope directories below one `runtime-config` root
- pattern-source helpers for adapters that do not use the default tree shape
- tree-query helpers for list/show/project/get/scope flows
- env-var and shell-assignment rendering from a loaded tree
- JSON and text file read/write helpers for adapter layers
- source, scope-file, and public-file path helpers for thin integrations
- schema validation for runtime-config targets

## What it is not

- not a framework module
- not a config-file parser beyond JSON
- not an application-specific directory convention

## Directory shape

```text
var/
  runtime-config/
    billing/
      runtime.config.json
    mail/
      runtime.config.json
```

## Basic example

```ts
import { loadRuntimeConfigTree } from '@lorion-org/runtime-config-node';
import { projectSectionedRuntimeConfig } from '@lorion-org/runtime-config';

const fragments = loadRuntimeConfigTree('./var');
const runtimeConfig = projectSectionedRuntimeConfig(fragments);

runtimeConfig.public.billingApiBase;
```

## Single fragment example

```ts
import { loadRuntimeConfigFragment } from '@lorion-org/runtime-config-node';

const billing = loadRuntimeConfigFragment('./var', 'billing');

billing?.public?.apiBase;
```

## Source and scope file example

Adapters often need one shared source convention and a few non-fragment files
inside a scope directory. Keep the source generic and pass application-specific
file names from the adapter.

```ts
import {
  readRuntimeConfigScopeJson,
  resolveRuntimeConfigPublicFilePath,
  resolveRuntimeConfigSource,
} from '@lorion-org/runtime-config-node';

const source = resolveRuntimeConfigSource({
  defaultVarDir: './var',
  env: process.env,
  envKey: 'APP_VAR_DIR',
});

readRuntimeConfigScopeJson(source, 'billing', 'settings.json');
// => { apiBase: '/api/billing' }

resolveRuntimeConfigPublicFilePath(source, 'billing/logo.svg');
// => '/absolute/project/path/var/runtime-config/public/billing/logo.svg'
```

## Pattern source example

Adapters can load fragments from path patterns when the directory convention is
owned by the host application. Pattern sources use exactly one `*` wildcard; the
matched segment becomes the scope id.

```ts
import {
  loadRuntimeConfigSourceTree,
  resolveRuntimeConfigSourceFiles,
  validateRuntimeConfigSourceScopes,
} from '@lorion-org/runtime-config-node';

const source = {
  paths: ['.runtimeconfig/runtime-config/*/runtime.config.json'],
};

resolveRuntimeConfigSourceFiles(source);
// => [{ scopeId: 'billing', configPath: '/project/.runtimeconfig/runtime-config/billing/runtime.config.json', ... }]

loadRuntimeConfigSourceTree(source).get('billing')?.public?.apiBase;
// => '/api/billing'

validateRuntimeConfigSourceScopes(source, [{ scopeId: 'billing', cwd: './extensions/billing' }]);
```

## Write fragment example

```ts
import { writeRuntimeConfigFragment } from '@lorion-org/runtime-config-node';

writeRuntimeConfigFragment('./var', 'billing', {
  public: {
    apiBase: '/api/billing',
  },
});
```

## Env assignment example

Runtime-config env rendering delegates projection rules to
`@lorion-org/runtime-config` and keeps file-system loading in this package.

```ts
import { loadRuntimeConfigShellAssignments } from '@lorion-org/runtime-config-node';

loadRuntimeConfigShellAssignments('./var', {
  prefix: 'APP',
});
// => APP_PUBLIC_BILLING_API_BASE='"/api/billing"'
```

## Tree query example

These helpers are useful for CLIs, local tooling, and lightweight adapters that
need to inspect runtime-config trees without reimplementing projection rules.

```ts
import {
  getRuntimeConfigScopeView,
  getRuntimeConfigValue,
  listRuntimeConfigFragments,
  projectRuntimeConfigTree,
} from '@lorion-org/runtime-config-node';

listRuntimeConfigFragments('./var');
// => { scopes: [{ scopeId: 'billing', ... }] }

projectRuntimeConfigTree('./var').runtimeConfig.public.billingApiBase;
// => '/api/billing'

getRuntimeConfigValue('./var', 'billing', 'apiBase').value;
// => '/api/billing'

getRuntimeConfigScopeView('./var', 'billing').config;
// => { apiBase: '/api/billing' }
```

## Schema validation example

Schema validation applies to the fragment file on disk. Projection into a flat
runtime object happens afterwards in `@lorion-org/runtime-config`.

```ts
import { validateRuntimeConfigSchemaTargets } from '@lorion-org/runtime-config-node';

validateRuntimeConfigSchemaTargets([
  {
    scopeId: 'billing',
    schemaPath: './schemas/billing.schema.json',
    configPath: './var/runtime-config/billing/runtime.config.json',
  },
]);
```

For adapters that resolve schema locations from scope directories, use
`validateRuntimeConfigScopes(...)` to collect `validated` and `skipped`
targets before the AJV validation runs.

Runnable example files live in [`examples/`](./examples).

## Local commands

```shell
cd packages/runtime-config-node
pnpm build
pnpm test
pnpm typecheck
pnpm package:check
```
