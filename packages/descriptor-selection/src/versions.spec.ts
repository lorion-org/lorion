import { describe, expect, it } from 'vitest';
import type { Descriptor } from '@lorion-org/composition-graph';
import { selectDescriptorsWithProviders } from './index';

const descriptor = (
  id: string,
  version = '1.0.0',
  dependencies?: Record<string, string>,
): Descriptor => ({ id, version, ...(dependencies ? { dependencies } : {}) });
const select = (items: Descriptor[], selected = ['app']) =>
  selectDescriptorsWithProviders({
    items,
    getDescriptor: (item) => item,
    withDescriptor: (_, item) => item,
    seed: { selected, selectionSeed: false },
  });
const identities = (items: Descriptor[]) => items.map(({ id, version }) => `${id}@${version}`);

describe('version-aware descriptor selection', () => {
  it('keeps exactly one compatible candidate and its source independent of discovery order', () => {
    const items = [
      descriptor('app', '1.0.0', { feature: '^1.0.0' }),
      { ...descriptor('feature', '1.2.0'), location: 'prototype/feature' },
      { ...descriptor('feature', '2.0.0'), location: 'packages/feature' },
      descriptor('feature', '1.10.0'),
    ];
    for (const order of [items, [...items].reverse()]) {
      expect(identities(select(order).items)).toEqual(['app@1.0.0', 'feature@1.10.0']);
    }
    items[0]!.dependencies = { feature: '1.2.0' };
    expect(select(items).items.find(({ id }) => id === 'feature')?.location).toBe(
      'prototype/feature',
    );
  });

  it('backtracks the parent version when its newest dependency closure is incompatible', () => {
    const items = [
      descriptor('app', '1.0.0', { feature: '^1.0.0', shared: '^1.0.0' }),
      descriptor('feature', '1.0.0', { shared: '^1.0.0' }),
      descriptor('feature', '1.1.0', { shared: '^2.0.0' }),
      descriptor('shared'),
      descriptor('shared', '2.0.0'),
    ];
    expect(identities(select(items).items)).toEqual(['app@1.0.0', 'feature@1.0.0', 'shared@1.0.0']);
  });

  it('reports both incompatible requirements and available versions', () => {
    const items = [
      descriptor('app', '1.0.0', { feature: '^1.0.0', shared: '^1.0.0' }),
      descriptor('feature', '1.0.0', { shared: '^2.0.0' }),
      descriptor('shared'),
      descriptor('shared', '2.0.0'),
    ];
    expect(() => select(items)).toThrow(
      /app@1.0.0 requires shared@\^1.0.0; feature@1.0.0 requires shared@\^2.0.0.*Available: 2.0.0, 1.0.0/,
    );
  });

  it('enforces constraints even when only one version was discovered', () => {
    expect(() =>
      select([descriptor('app', '1.0.0', { feature: '^2.0.0' }), descriptor('feature')]),
    ).toThrow('No compatible version for "feature"');
  });

  it('does not use disabled candidates or requirements from inactive descriptors', () => {
    const items = [
      descriptor('app', '1.0.0', { feature: '^1.0.0' }),
      descriptor('feature'),
      { ...descriptor('feature', '1.1.0'), disabled: true },
      descriptor('unused', '1.0.0', { feature: '^3.0.0' }),
    ];
    expect(identities(select(items).items)).toEqual(['app@1.0.0', 'feature@1.0.0']);
  });

  it('keeps provider precedence and ignores losing provider constraints', () => {
    const items = [
      descriptor('app', '1.0.0', { payments: '^1.0.0', stripe: '^2.0.0' }),
      descriptor('payments'),
      {
        ...descriptor('stripe', '1.0.0', { shared: '^2.0.0' }),
        providesFor: 'payments',
        defaultFor: 'payments',
      },
      {
        ...descriptor('stripe', '2.0.0', { shared: '^2.0.0' }),
        providesFor: 'payments',
        defaultFor: 'payments',
      },
      { ...descriptor('invoice', '1.0.0', { shared: '^1.0.0' }), providesFor: 'payments' },
      descriptor('shared'),
    ];
    expect(identities(select(items, ['app', 'invoice']).items)).toEqual([
      'app@1.0.0',
      'invoice@1.0.0',
      'payments@1.0.0',
      'shared@1.0.0',
    ]);
  });

  it('resolves cycles without installing a second version', () => {
    expect(
      identities(
        select([
          descriptor('app', '1.0.0', { feature: '~1.0.0' }),
          descriptor('feature', '1.0.1', { app: '^1.0.0' }),
          descriptor('feature', '1.1.0'),
        ]).items,
      ),
    ).toEqual(['app@1.0.0', 'feature@1.0.1']);
  });

  it('requires an explicit prerelease range for a prerelease dependency', () => {
    const items = [
      descriptor('app', '1.0.0', { feature: '^1.0.0' }),
      descriptor('feature', '1.1.0-beta.1'),
      descriptor('feature'),
    ];
    expect(identities(select(items).items)).toContain('feature@1.0.0');
    items[0]!.dependencies = { feature: '^1.1.0-beta.1' };
    expect(identities(select(items).items)).toContain('feature@1.1.0-beta.1');
  });

  it('rejects duplicate identities, malformed versions, malformed ranges and missing targets', () => {
    expect(() => select([descriptor('app'), descriptor('app')])).toThrow(/Duplicate.*app.*1.0.0/);
    expect(() => select([descriptor('app', '^1.0.0')])).toThrow('invalid version');
    expect(() => select([descriptor('app', '1.0.0', { feature: 'banana' })])).toThrow(
      'invalid version range',
    );
    expect(() => select([descriptor('app', '1.0.0', { feature: '^1.0.0' })])).toThrow(
      'Available: none',
    );
  });

  it('does not mutate frozen descriptors or the candidate inventory', () => {
    const items = [
      descriptor('app', '1.0.0', { feature: '^1.0.0' }),
      descriptor('feature'),
      descriptor('feature', '2.0.0'),
    ];
    for (const item of items) {
      Object.freeze(item.dependencies);
      Object.freeze(item);
    }
    Object.freeze(items);
    expect(select(items).items).toHaveLength(2);
    expect(items).toHaveLength(3);
  });
});

it('rejects an impossible fixed requirement before exploring unrelated version combinations', () => {
  const items = [descriptor('app', '1.0.0', { absent: '1.0.0' })];
  for (let index = 0; index < 30; index++)
    items.push(descriptor(`unused-${index}`), descriptor(`unused-${index}`, '2.0.0'));
  expect(() => select(items)).toThrow('Available: none');
  expect(() => select(items, ['unknown'])).toThrow('Unknown selected descriptors');
}, 1000);

it('agrees with an exhaustive oracle over generated transitive exact-version constraints', () => {
  let randomState = 4711;
  const next = () => (randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0);
  for (let scenario = 0; scenario < 80; scenario++) {
    const items = [
      descriptor('app', '1.0.0', {
        a: next() % 3 === 0 ? '1.0.0' : '2.0.0',
        c: next() % 3 === 0 ? '2.0.0' : '1.0.0',
      }),
    ];
    for (const id of ['a', 'b', 'c']) {
      for (const version of ['1.0.0', '2.0.0']) {
        const target = id === 'a' ? 'b' : id === 'b' ? 'c' : undefined;
        items.push(
          descriptor(
            id,
            version,
            target ? { [target]: next() % 3 === 0 ? '1.0.0' : '2.0.0' } : undefined,
          ),
        );
      }
    }
    let expected: string[] | undefined;
    for (const a of ['2.0.0', '1.0.0'])
      for (const b of ['2.0.0', '1.0.0'])
        for (const c of ['2.0.0', '1.0.0']) {
          const chosen = { app: '1.0.0', a, b, c };
          const active = items.filter(
            (entry) => chosen[entry.id as keyof typeof chosen] === entry.version,
          );
          if (
            active.every((entry) =>
              Object.entries(entry.dependencies ?? {}).every(
                ([id, range]) => chosen[id as keyof typeof chosen] === range,
              ),
            )
          ) {
            expected ??= identities(active).sort();
          }
        }
    if (expected)
      expect(identities(select([...items].reverse()).items), `scenario ${scenario}`).toEqual(
        expected,
      );
    else expect(() => select(items), `scenario ${scenario}`).toThrow('No compatible version');
  }
});

it('does not explore inactive version combinations on a provider version conflict', () => {
  const items = [
    descriptor('app', '1.0.0', { slot: '1.0.0', 'z-provider': '2.0.0' }),
    descriptor('slot'),
    { ...descriptor('z-provider'), providesFor: 'slot' },
  ];
  for (let index = 0; index < 30; index++)
    items.push(descriptor(`unused-${index}`), descriptor(`unused-${index}`, '2.0.0'));
  let copies = 0;
  expect(() =>
    selectDescriptorsWithProviders({
      items,
      getDescriptor: (item) => item,
      withDescriptor: (_, item) => {
        copies++;
        return item;
      },
      seed: { selected: ['app'], selectionSeed: false },
    }),
  ).toThrow('No compatible version for "z-provider"');
  expect(copies).toBeLessThan(200);
}, 1000);

it.each([
  { id: 'dependencies', direction: 'incoming' as const },
  { id: 'dependencies', field: 'otherDependencies' },
])('respects a redefined dependency relation: %j', (relation) => {
  const items = [descriptor('app', '1.0.0', { lib: '1.0.0' }), descriptor('lib')];
  const result = selectDescriptorsWithProviders({
    items,
    getDescriptor: (item) => item,
    withDescriptor: (_, item) => item,
    seed: { selected: ['app'], selectionSeed: false },
    relationDescriptors: [relation],
  });
  expect(identities(result.items)).toEqual(['app@1.0.0']);
});

it('retains version choices reached through incoming custom relations', () => {
  const items = [
    descriptor('app', '1.0.0', { shared: '1.0.0' }),
    descriptor('shared'),
    { ...descriptor('guest', '1.0.0', { shared: '1.0.0' }), attachesTo: 'app' },
    { ...descriptor('guest', '2.0.0', { shared: '2.0.0' }), attachesTo: 'app' },
  ];
  const result = selectDescriptorsWithProviders({
    items,
    getDescriptor: (item) => item,
    withDescriptor: (_, item) => item,
    seed: { selected: ['app'], selectionSeed: false },
    relationDescriptors: [
      { id: 'guests', field: 'attachesTo', direction: 'incoming', roles: ['resolution'] },
    ],
  });
  expect(identities(result.items)).toEqual(['app@1.0.0', 'guest@1.0.0', 'shared@1.0.0']);
});

it('rejects duplicate identities even when their diagnostic source labels are empty', () => {
  const items = [descriptor('app'), descriptor('app')];
  expect(() =>
    selectDescriptorsWithProviders({
      items,
      getDescriptor: (item) => item,
      getSource: () => '',
      withDescriptor: (_, item) => item,
      seed: { selected: ['app'], selectionSeed: false },
    }),
  ).toThrow('Duplicate descriptor id');
});
