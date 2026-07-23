import { describe, expect, it } from 'vitest';

import type { Descriptor } from '@lorion-org/composition-graph';

import {
  assertSingleDefaultProvider,
  resolveBaseSelection,
  resolveDescriptorSelection,
  selectDescriptors,
} from './index';

function reference(): Descriptor[] {
  return [
    { id: 'platform', version: '1.0.0', dependencies: { tokens: '^1.0.0' } },
    { id: 'tokens', version: '1.0.0' },
    { id: 'auth', version: '1.0.0' },
    { id: 'auth-session', version: '1.0.0', providesFor: 'auth', defaultFor: 'auth' },
    { id: 'auth-oidc', version: '1.0.0', providesFor: 'auth' },
    { id: 'dashboard', version: '1.0.0' },
    { id: 'reports', version: '1.0.0' },
  ];
}

function select(
  items: Descriptor[],
  seed: Parameters<typeof selectDescriptors>[0]['seed'],
): string[] {
  return selectDescriptors({
    items,
    getDescriptor: (descriptor) => descriptor,
    withDescriptor: (_item, descriptor) => descriptor,
    seed,
  })
    .map((descriptor) => descriptor.id)
    .sort();
}

describe('resolveDescriptorSelection', () => {
  it('prefers explicit selected over everything', () => {
    expect(
      resolveDescriptorSelection({
        selected: ['a'],
        defaultSelection: ['b'],
        selectionSeed: { env: { X: 'c' }, envKeys: ['X'], argv: [] },
      }),
    ).toEqual(['a']);
  });

  it('uses defaultSelection when selectionSeed is disabled', () => {
    expect(resolveDescriptorSelection({ selectionSeed: false, defaultSelection: ['b'] })).toEqual([
      'b',
    ]);
  });

  it('parses a CLI argv seed', () => {
    expect(
      resolveDescriptorSelection({
        selectionSeed: { argv: ['--features', 'reports'], env: {}, cliKeys: ['--features'] },
      }),
    ).toEqual(['reports']);
  });

  it('reads an injected env seed, falling back to defaultSelection', () => {
    expect(
      resolveDescriptorSelection({
        defaultSelection: ['b'],
        selectionSeed: { argv: [], env: { X: 'c' }, envKeys: ['X'] },
      }),
    ).toEqual(['c']);
    expect(
      resolveDescriptorSelection({
        defaultSelection: ['b'],
        selectionSeed: { argv: [], env: {}, envKeys: ['X'] },
      }),
    ).toEqual(['b']);
  });
});

describe('resolveBaseSelection', () => {
  it('uses baseDescriptors when no baseSeed is configured', () => {
    expect(resolveBaseSelection({ baseDescriptors: ['base'] })).toEqual(['base']);
  });

  it('uses baseDescriptors when baseSeed is disabled', () => {
    expect(resolveBaseSelection({ baseDescriptors: ['base'], baseSeed: false })).toEqual(['base']);
  });

  it('replaces baseDescriptors when baseSeed parses a value', () => {
    expect(
      resolveBaseSelection({
        baseDescriptors: ['base'],
        baseSeed: { argv: [], env: { B: 'slim' }, envKeys: ['B'] },
      }),
    ).toEqual(['slim']);
  });

  it('falls back to baseDescriptors when baseSeed parses nothing', () => {
    expect(
      resolveBaseSelection({
        baseDescriptors: ['base'],
        baseSeed: { argv: [], env: {}, envKeys: ['B'] },
      }),
    ).toEqual(['base']);
  });
});

describe('selectDescriptors', () => {
  it('resolves base, selection, transitive dependencies, and the default provider', () => {
    expect(
      select(reference(), { baseDescriptors: ['platform', 'auth'], selected: ['dashboard'] }),
    ).toEqual(['auth', 'auth-session', 'dashboard', 'platform', 'tokens']);
  });

  it('lets an explicitly selected provider override and drop the default', () => {
    const ids = select(reference(), {
      baseDescriptors: ['platform', 'auth'],
      selected: ['dashboard', 'auth-oidc'],
    });
    expect(ids).toContain('auth-oidc');
    expect(ids).not.toContain('auth-session');
  });

  it('resolves the base from baseSeed, overriding baseDescriptors, independent of the selection', () => {
    // baseSeed replaces the base floor; the selection (dashboard) is unaffected.
    expect(
      select(reference(), {
        baseDescriptors: ['tokens'],
        baseSeed: { argv: [], env: { B: 'reports' }, envKeys: ['B'] },
        selected: ['dashboard'],
      }),
    ).toEqual(['dashboard', 'reports']);
  });

  it('returns every enabled item when nothing is selected or based', () => {
    expect(select(reference(), { selectionSeed: false })).toHaveLength(7);
  });

  it('filters out disabled items', () => {
    const items = reference().map((descriptor) =>
      descriptor.id === 'reports' ? { ...descriptor, disabled: true } : descriptor,
    );
    expect(select(items, { selectionSeed: false })).not.toContain('reports');
  });

  it('preserves the host item type through selection via getDescriptor/withDescriptor', () => {
    type Item = { descriptor: Descriptor; label: string };
    const items: Item[] = reference().map((descriptor) => ({
      descriptor,
      label: `item:${descriptor.id}`,
    }));

    // The override path rewrites descriptors (provider preferences applied); the
    // wrapper fields must survive.
    const selected = selectDescriptors({
      items,
      getDescriptor: (item) => item.descriptor,
      withDescriptor: (item, descriptor) => ({ ...item, descriptor }),
      seed: { baseDescriptors: ['platform', 'auth'], selected: ['dashboard', 'auth-oidc'] },
    });

    expect(selected.every((item) => item.label === `item:${item.descriptor.id}`)).toBe(true);
    expect(selected.some((item) => item.descriptor.id === 'auth-oidc')).toBe(true);
    expect(selected.some((item) => item.descriptor.id === 'auth-session')).toBe(false);
  });

  it('handles array-form defaultFor (one provider is the default for several slots)', () => {
    const items: Descriptor[] = [
      { id: 'auth', version: '1.0.0' },
      { id: 'session', version: '1.0.0' },
      {
        id: 'local',
        version: '1.0.0',
        providesFor: ['auth', 'session'],
        defaultFor: ['auth', 'session'],
      },
    ];
    expect(select(items, { baseDescriptors: ['auth', 'session'] })).toEqual([
      'auth',
      'local',
      'session',
    ]);
  });

  it('rejects array-form defaultFor conflicts', () => {
    const items: Descriptor[] = [
      { id: 'auth', version: '1.0.0' },
      { id: 'a', version: '1.0.0', providesFor: 'auth', defaultFor: ['auth'] },
      { id: 'b', version: '1.0.0', providesFor: 'auth', defaultFor: ['auth'] },
    ];
    expect(() => select(items, { selected: ['auth'] })).toThrow(
      /exactly one defaultFor provider per capability.*a, b/s,
    );
  });

  it('rejects two providers that both declare defaultFor the same capability', () => {
    const items = reference().concat({
      id: 'auth-extra',
      version: '1.0.0',
      providesFor: 'auth',
      defaultFor: 'auth',
    });
    expect(() => select(items, { selected: ['auth'] })).toThrow(
      /exactly one defaultFor provider per capability.*auth-extra, auth-session/s,
    );
  });
});

describe('assertSingleDefaultProvider', () => {
  it('passes when each capability has at most one default provider', () => {
    expect(() => assertSingleDefaultProvider(reference())).not.toThrow();
  });
});
