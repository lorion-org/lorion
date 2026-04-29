import { describe, expect, it } from 'vitest';

import { createRegistry, createRegistryHub, type RegistryItem } from './index';

type CommandItem = RegistryItem & {
  command: string;
};

type ToolItem = RegistryItem & {
  title: string;
};

describe('createRegistry', () => {
  it('creates an empty registry and lists no items', () => {
    const registry = createRegistry<CommandItem>('commands');

    expect(registry.id).toBe('commands');
    expect(registry.list()).toEqual([]);
    expect(registry.entries()).toEqual([]);
  });

  it('registers a single item and reads it back by id', () => {
    const registry = createRegistry<CommandItem>('commands');

    registry.register({ id: 'build', command: 'pnpm build' });

    expect(registry.get('build')).toEqual({ id: 'build', command: 'pnpm build' });
    expect(registry.list()).toEqual([{ id: 'build', command: 'pnpm build' }]);
  });

  it('registers multiple items at once', () => {
    const registry = createRegistry<CommandItem>('commands');

    registry.register([
      { id: 'build', command: 'pnpm build' },
      { id: 'test', command: 'pnpm test' },
    ]);

    expect(registry.list()).toEqual([
      { id: 'build', command: 'pnpm build' },
      { id: 'test', command: 'pnpm test' },
    ]);
  });

  it('returns undefined for unknown items', () => {
    const registry = createRegistry<CommandItem>('commands');

    expect(registry.get('missing')).toBeUndefined();
  });

  it('overwrites duplicate ids deterministically', () => {
    const registry = createRegistry<CommandItem>('commands');

    registry.register({ id: 'build', command: 'pnpm build' });
    registry.register({ id: 'build', command: 'pnpm run build:debug' });

    expect(registry.list()).toEqual([{ id: 'build', command: 'pnpm run build:debug' }]);
    expect(registry.entries()).toEqual([
      ['build', { id: 'build', command: 'pnpm run build:debug' }],
    ]);
  });

  it('keeps state across multiple reads', () => {
    const registry = createRegistry<CommandItem>('commands');

    registry.register({ id: 'build', command: 'pnpm build' });

    expect(registry.list()).toHaveLength(1);
    expect(registry.get('build')?.command).toBe('pnpm build');
    expect(registry.list()).toHaveLength(1);
  });
});

describe('createRegistryHub', () => {
  it('creates and returns the same registry instance for repeated lookups', () => {
    const hub = createRegistryHub();

    const first = hub.createRegistry<CommandItem>('commands');
    const second = hub.getRegistry<CommandItem>('commands');

    expect(second).toBe(first);
  });

  it('returns the existing registry when createRegistry is called again for the same id', () => {
    const hub = createRegistryHub();

    const first = hub.createRegistry<CommandItem>('commands');
    const second = hub.createRegistry<CommandItem>('commands');

    expect(second).toBe(first);
  });

  it('registers items in an existing registry', () => {
    const hub = createRegistryHub();
    const registry = hub.createRegistry<CommandItem>('commands');

    hub.register<CommandItem>('commands', { id: 'build', command: 'pnpm build' });

    expect(registry.list()).toEqual([{ id: 'build', command: 'pnpm build' }]);
    expect(hub.get<CommandItem>('commands', 'build')).toEqual({
      id: 'build',
      command: 'pnpm build',
    });
  });

  it('lazy-creates a registry when register is called first', () => {
    const hub = createRegistryHub();

    hub.register<ToolItem>('tools', { id: 'lint', title: 'Lint workspace' });

    expect(hub.getRegistry<ToolItem>('tools')?.id).toBe('tools');
    expect(hub.list<ToolItem>('tools')).toEqual([{ id: 'lint', title: 'Lint workspace' }]);
  });

  it('returns an empty list for unknown registries', () => {
    const hub = createRegistryHub();

    expect(hub.list<CommandItem>('missing')).toEqual([]);
    expect(hub.entries()).toEqual([]);
  });

  it('returns undefined for unknown registries and items', () => {
    const hub = createRegistryHub();

    expect(hub.getRegistry<CommandItem>('missing')).toBeUndefined();
    expect(hub.get<CommandItem>('missing', 'build')).toBeUndefined();
  });

  it('supports different typed registries in one hub', () => {
    const hub = createRegistryHub();

    hub.register<CommandItem>('commands', { id: 'build', command: 'pnpm build' });
    hub.register<ToolItem>('tools', { id: 'lint', title: 'Lint workspace' });

    expect(hub.get<CommandItem>('commands', 'build')?.command).toBe('pnpm build');
    expect(hub.get<ToolItem>('tools', 'lint')?.title).toBe('Lint workspace');
  });

  it('exposes created registries through hub entries for inspect and debug use cases', () => {
    const hub = createRegistryHub();

    hub.createRegistry<CommandItem>('commands');
    hub.register<ToolItem>('tools', { id: 'lint', title: 'Lint workspace' });

    expect(hub.entries().map(([registryId, registry]) => [registryId, registry.id])).toEqual([
      ['commands', 'commands'],
      ['tools', 'tools'],
    ]);
  });
});
