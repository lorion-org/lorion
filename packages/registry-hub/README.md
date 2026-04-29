# @lorion-org/registry-hub

Framework-free typed registry and registry-hub primitives.

This package provides small registry primitives for systems that need typed named entries without coupling the registry to a framework runtime.
It stays intentionally small and does not know anything about Nuxt, Nitro, H3, or app-specific lifecycle hooks.

## Design goals

- generic names for reusable runtime terms
- deterministic overwrite behavior for duplicate item ids
- lazy registry creation via the hub
- no framework globals, events, priorities, or persistence
- `entries()` covers explicit inspect/debug and enumeration use cases in v1

## Installation

```shell
pnpm add @lorion-org/registry-hub
```

## When not to use this package

This package is intentionally small. It is not a fit if you need:

- ordered or priority-based plugin execution
- unregister or disposal semantics
- async lifecycle orchestration
- persistence or distributed registry state

## API

```ts
import { createRegistry, createRegistryHub } from '@lorion-org/registry-hub';
```

### Create a single registry

```ts
import { createRegistry, type RegistryItem } from '@lorion-org/registry-hub';

type Command = RegistryItem & {
  command: string;
};

const commands = createRegistry<Command>('commands');

commands.register({ id: 'build', command: 'pnpm build' });

commands.get('build');
commands.list();
commands.entries();
```

### Use a registry hub

```ts
import { createRegistryHub, type RegistryItem } from '@lorion-org/registry-hub';

type Tool = RegistryItem & {
  title: string;
};

const hub = createRegistryHub();

hub.createRegistry<Tool>('tools');
hub.register<Tool>('tools', { id: 'lint', title: 'Lint workspace' });

const tool = hub.get<Tool>('tools', 'lint');
const tools = hub.list<Tool>('tools');
const registries = hub.entries();
```

### Renderer registry example

```ts
import { createRegistry, type RegistryItem } from '@lorion-org/registry-hub';

type FieldRenderer = RegistryItem & {
  component: string;
};

const renderers = createRegistry<FieldRenderer>('field-renderers');

renderers.register([
  { id: 'text', component: 'TextFieldRenderer' },
  { id: 'date', component: 'DateFieldRenderer' },
]);

const knownRenderers = renderers.entries();
```

### Framework recipe

The package does not ship framework bindings, but it is designed to be easy to inject into one.

```ts
import { createRegistryHub } from '@lorion-org/registry-hub';

export default defineNuxtPlugin(() => {
  const registryHub = createRegistryHub();

  return {
    provide: {
      registryHub,
    },
  };
});
```

Another plugin can then consume that injected hub and register its own entries.

```ts
import type { RegistryItem } from '@lorion-org/registry-hub';

type Tool = RegistryItem & {
  title: string;
};

export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.$registryHub.register<Tool>('tools', {
    id: 'lint',
    title: 'Lint workspace',
  });
});
```

A composable can later load all entries of one typed registry from that same hub.

```ts
import type { RegistryItem } from '@lorion-org/registry-hub';

type Tool = RegistryItem & {
  title: string;
};

export function useTools(): Tool[] {
  return useNuxtApp().$registryHub.list<Tool>('tools');
}
```

Runnable example files live in [`examples/`](./examples).
The Node example imports the published package name instead of local source files so it mirrors real consumer usage.
The examples use neutral domain names so the package can be understood as a generic registry utility.

## Local commands

```shell
cd packages/registry-hub
pnpm build
pnpm test
pnpm coverage
pnpm typecheck
pnpm package:check
```

`pnpm package:check` builds the package, runs `pnpm pack --dry-run`, and
validates the published package shape with `publint`.
