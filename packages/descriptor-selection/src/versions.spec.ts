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

it('uses descriptor ids rather than version ranges in a values-mode dependency relation', () => {
  const items = [
    descriptor('app', '1.0.0', { runtime: 'lib' }),
    descriptor('lib'),
    descriptor('lib', '2.0.0'),
  ];
  const result = selectDescriptorsWithProviders({
    items,
    getDescriptor: (item) => item,
    withDescriptor: (_, item) => item,
    seed: { selected: ['app'], selectionSeed: false },
    relationDescriptors: [{ id: 'dependencies', targetMode: 'values' }],
  });
  expect(identities(result.items)).toEqual(['app@1.0.0', 'lib@2.0.0']);
  expect(() => select(items)).toThrow('invalid version range "lib"');
});

it('bounds work for inactive providers when an active provider version cannot match', () => {
  const items = [
    descriptor('app', '1.0.0', { slot: '1.0.0', 'z-provider': '2.0.0' }),
    descriptor('slot'),
    { ...descriptor('z-provider'), providesFor: 'slot' },
  ];
  for (let index = 0; index < 8; index++) {
    for (const version of ['1.0.0', '2.0.0'])
      items.push({ ...descriptor(`unused-${index}`, version), providesFor: 'slot' });
  }
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
  expect(copies).toBeLessThan(100);
});

it('reconsiders implicit roots when a candidate changes its provider role', () => {
  expect(
    identities(
      select(
        [
          descriptor('slot'),
          descriptor('optional', '2.0.0', { missing: '1.0.0' }),
          { ...descriptor('optional'), providesFor: 'slot' },
        ],
        [],
      ).items,
    ),
  ).toEqual(['slot@1.0.0']);
});

it('reconsiders defaults even when their slots are outside the selected closure', () => {
  const items = [
    descriptor('app'),
    descriptor('slot'),
    { ...descriptor('provider-a', '2.0.0'), providesFor: 'slot', defaultFor: 'slot' },
    { ...descriptor('provider-a'), providesFor: 'slot' },
    { ...descriptor('provider-b'), providesFor: 'slot', defaultFor: 'slot' },
  ];
  expect(identities(select(items).items)).toEqual(['app@1.0.0']);
});

it.each(['v1.0.0', ' 1.0.0', '1.0.0 ', '1.0', '01.0.0'])(
  'rejects nonconcrete own version %j',
  (version) => {
    expect(() => select([descriptor('app', version)])).toThrow('invalid version');
  },
);

it.each(['not-a-range', '^banana'])('rejects an invalid canonical range %j', (range) => {
  expect(() => select([descriptor('app', '1.0.0', { lib: range }), descriptor('lib')])).toThrow(
    'invalid version range',
  );
});

it('keeps build-metadata tie breaking deterministic across discovery order', () => {
  const items = [descriptor('app', '1.0.0+z'), descriptor('app', '1.0.0+a')];
  for (const order of [items, [...items].reverse()])
    expect(identities(select(order).items)).toEqual(['app@1.0.0+a']);
});

it.each([
  { items: [descriptor('app', '^1.0.0')], message: /invalid version/ },
  { items: [descriptor('app', '1.0.0', { lib: 'banana' })], message: /invalid version range/ },
  { items: [descriptor('app', '1.0.0', { lib: '1.0.0' })], message: /Available: none/ },
  {
    items: [descriptor('app', '1.0.0', { lib: '2.0.0' }), descriptor('lib')],
    message: /app@1.0.0 requires lib@2.0.0.*Available: 1.0.0/,
  },
])(
  'throws a diagnostic Error for invalid or unsatisfiable selection: $message',
  ({ items, message }) => {
    let failure: unknown;
    try {
      select(items);
    } catch (error) {
      failure = error;
    }
    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toMatch(message);
  },
);

it.each([undefined, 'other-slot'])(
  'reconsiders inactive provider roles that make an active dependency require a slot: %s',
  (providesFor) => {
    const items = [
      descriptor('app', '1.0.0', { slot: '1.0.0' }),
      descriptor('slot'),
      { ...descriptor('unused', '2.0.0'), providesFor: 'slot' },
      { ...descriptor('unused'), ...(providesFor ? { providesFor } : {}) },
      descriptor('other-slot'),
    ];
    for (const order of [items, [...items].reverse()])
      expect(identities(select(order).items)).toEqual(['app@1.0.0', 'slot@1.0.0']);
  },
);

it('rejects a mandatory conflict without multiplying otherwise reachable version choices', () => {
  const requirements: Record<string, string> = { bridge: '1.0.0' };
  const items = [descriptor('shared'), descriptor('bridge', '1.0.0', { shared: '2.0.0' })];
  for (let index = 0; index < 8; index++) {
    const id = `feature-${index}`;
    requirements[id] = '*';
    items.push(
      descriptor(id, '1.0.0', { shared: '*' }),
      descriptor(id, '2.0.0', { shared: '^1.0.0' }),
    );
  }
  items.push(descriptor('app', '1.0.0', requirements));
  let copies = 0;
  let failure: unknown;
  try {
    selectDescriptorsWithProviders({
      items,
      getDescriptor: (item) => item,
      withDescriptor: (_, item) => {
        copies++;
        return item;
      },
      seed: { selected: ['app'], selectionSeed: false },
    });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toContain('No compatible version for "shared"');
  expect(copies).toBeLessThan(100);
});

it('prioritizes candidate ids before versions when compatible assignments compete', () => {
  const items = [
    descriptor('b'),
    descriptor('b', '2.0.0'),
    descriptor('app', '1.0.0', { a: '*', b: '*' }),
    descriptor('a', '1.0.0', { b: '2.0.0' }),
    descriptor('a', '2.0.0', { b: '1.0.0' }),
  ];
  for (const order of [items, [...items].reverse()])
    expect(identities(select(order).items)).toEqual(['a@2.0.0', 'app@1.0.0', 'b@1.0.0']);
});

it('does not preemptively activate dependencies that only a losing parent version requires', () => {
  const items = [
    descriptor('app', '1.0.0', { feature: '*' }),
    descriptor('feature', '2.0.0', { unused: '*' }),
    descriptor('feature', '1.0.0'),
    descriptor('unused', '1.0.0', { missing: '1.0.0' }),
  ];
  expect(identities(select(items).items)).toEqual(['app@1.0.0', 'feature@1.0.0']);
});

it('ignores an unsatisfiable version range on a provider edge removed by explicit precedence', () => {
  const items = [
    descriptor('app', '1.0.0', { slot: '1.0.0', losing: '99.0.0' }),
    descriptor('slot'),
    { ...descriptor('losing'), providesFor: 'slot' },
    { ...descriptor('chosen'), providesFor: 'slot' },
  ];
  expect(identities(select(items, ['app', 'chosen']).items)).toEqual([
    'app@1.0.0',
    'chosen@1.0.0',
    'slot@1.0.0',
  ]);
});

it.each([
  {
    getSource: (item: Descriptor) => `host/${item.location}`,
    expected: '(host/left and host/right)',
  },
  { getSource: undefined, expected: '(left and right)' },
])('names both sources in duplicate identity diagnostics: $expected', ({ getSource, expected }) => {
  let failure: unknown;
  try {
    selectDescriptorsWithProviders({
      items: [
        { ...descriptor('app'), location: 'left' },
        { ...descriptor('app'), location: 'right' },
      ],
      getDescriptor: (item) => item,
      ...(getSource ? { getSource } : {}),
      withDescriptor: (item, next) => ({ ...item, ...next }),
      seed: { selected: ['app'], selectionSeed: false },
    });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toContain(expected);
});

it.each([false, true])(
  'bounds active version choices with an impossible provider (overridden=%s)',
  (overridden) => {
    const dependencies: Record<string, string> = { slot: '1.0.0', provider: '2.0.0' };
    const items: Descriptor[] = [
      descriptor('slot'),
      { ...descriptor('provider'), providesFor: 'slot' },
    ];
    for (let index = 0; index < 14; index++) {
      const id = `feature-${index}`;
      dependencies[id] = '^1.0.0';
      items.push(descriptor(id), descriptor(id, '1.1.0'));
    }
    items.push(descriptor('app', '1.0.0', dependencies));
    if (overridden) items.push({ ...descriptor('alternative'), providesFor: 'slot' });
    let copies = 0;
    let failure: unknown;
    let resolved: Descriptor[] = [];
    try {
      resolved = selectDescriptorsWithProviders({
        items,
        getDescriptor: (item) => item,
        withDescriptor: (_, item) => {
          copies++;
          return item;
        },
        seed: { selected: overridden ? ['app', 'alternative'] : ['app'], selectionSeed: false },
      }).items;
    } catch (error) {
      failure = error;
    }
    if (overridden) {
      expect(failure).toBeUndefined();
      expect(identities(resolved)).toContain('alternative@1.0.0');
      expect(resolved.some(({ id }) => id === 'provider')).toBe(false);
    } else {
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain('app@1.0.0 requires provider@2.0.0');
    }
    expect(copies).toBeLessThan(100);
  },
);

it('selects compatible provider versions while preserving arbitrary host metadata', () => {
  const metadata: Record<string, unknown> = { value: 1n };
  metadata.self = metadata;
  const items = [
    descriptor('app', '1.0.0', { slot: '1.0.0', provider: '^1.0.0' }),
    descriptor('slot'),
    { ...descriptor('provider', '1.2.0'), providesFor: 'slot', metadata },
    { ...descriptor('provider', '2.0.0'), providesFor: 'slot', metadata },
  ];
  for (const order of [items, [...items].reverse()]) {
    const result = select(order).items;
    expect(identities(result)).toEqual(['app@1.0.0', 'provider@1.2.0', 'slot@1.0.0']);
    expect(result.find(({ id }) => id === 'provider')?.metadata).toBe(metadata);
  }
});

it.each(['version', 'location'])(
  'keeps host relations that read %s in the version search',
  (field) => {
    const items: Descriptor[] = [
      descriptor('app', '1.0.0', { shared: '1.0.0' }),
      descriptor('shared'),
      descriptor('1.0.0'),
      descriptor('2.0.0', '1.0.0', { shared: '2.0.0' }),
      { ...descriptor('guest', '1.0.0'), location: '1.0.0' },
      { ...descriptor('guest', '2.0.0'), location: '2.0.0' },
    ];
    const result = selectDescriptorsWithProviders({
      items,
      getDescriptor: (item) => item,
      withDescriptor: (_, item) => item,
      seed: { selected: ['app', 'guest'], selectionSeed: false },
      relationDescriptors: [{ id: 'host-link', field, roles: ['resolution'] }],
    });
    expect(identities(result.items)).toContain('guest@1.0.0');
    expect(result.items.some(({ id }) => id === '2.0.0')).toBe(false);
  },
);

it.each(['', ' ', '*', '1.x', '>=1.0.0 <2.0.0', '1.0.0 || 2.0.0', '1.0.0 - 2.0.0'])(
  'accepts npm range syntax %j',
  (range) => {
    const result = select([
      descriptor('app', '1.0.0', { lib: range }),
      descriptor('lib'),
      descriptor('lib', '1.5.0'),
    ]);
    expect(identities(result.items)).toContain(
      range === '1.0.0 || 2.0.0' ? 'lib@1.0.0' : 'lib@1.5.0',
    );
  },
);

it('orders equal-precedence build metadata by code units independently of locale', () => {
  const items = [descriptor('app', '1.0.0+i'), descriptor('app', '1.0.0+I')];
  for (const order of [items, [...items].reverse()])
    expect(identities(select(order).items)).toEqual(['app@1.0.0+I']);
});

it('uses code-unit id priority when compatible assignments compete', () => {
  const items = [
    descriptor('app', '1.0.0', { a: '*', Z: '*', shared: '*' }),
    descriptor('a', '1.0.0', { shared: '1.0.0' }),
    descriptor('a', '2.0.0', { shared: '2.0.0' }),
    descriptor('Z', '1.0.0', { shared: '2.0.0' }),
    descriptor('Z', '2.0.0', { shared: '1.0.0' }),
    descriptor('shared'),
    descriptor('shared', '2.0.0'),
  ];
  for (const order of [items, [...items].reverse()])
    expect(identities(select(order).items)).toEqual([
      'Z@2.0.0',
      'a@1.0.0',
      'app@1.0.0',
      'shared@1.0.0',
    ]);
});

it('rejects a missing dependency even when otherwise compatible version choices have fixed relations', () => {
  let failure: unknown;
  try {
    select([
      descriptor('app', '1.0.0', { lib: '*', missing: '1.0.0' }),
      descriptor('lib'),
      descriptor('lib', '2.0.0'),
    ]);
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(Error);
  expect((failure as Error).message).toContain('requires missing@1.0.0');
  expect((failure as Error).message).toContain('Available: none');
});

describe('grouping version and provider invariants', () => {
  const providers: Descriptor[] = [
    descriptor('auth'),
    { ...descriptor('a'), providesFor: 'auth' },
    { ...descriptor('b'), providesFor: 'auth' },
    descriptor('app', '1.0.0', { a: '*' }),
  ];
  it('backtracks when a candidate changes grouping role but retains the same dependency edges', () => {
    const items = [
      ...providers.map((value) => ({ descriptor: value, virtual: false })),
      { descriptor: descriptor('profile', '1.0.0', { b: '*' }), virtual: true },
      { descriptor: descriptor('profile', '2.0.0', { b: '*' }), virtual: false },
    ];
    for (const order of [items, [...items].reverse()]) {
      const result = selectDescriptorsWithProviders({
        items: order,
        getDescriptor: (item) => item.descriptor,
        withDescriptor: (item, descriptor) => ({ ...item, descriptor }),
        getSelectionGroupMembers: (item) =>
          item.virtual ? Object.keys(item.descriptor.dependencies ?? {}) : undefined,
        seed: { selected: ['app', 'profile'], selectionSeed: false },
      });
      expect(
        result.items.find((item) => item.descriptor.id === 'profile')?.descriptor.version,
      ).toBe('1.0.0');
      expect(result.providerSelection.slots[0]).toMatchObject({
        selectedProviderId: 'b',
        mode: 'explicit',
      });
    }
  });
  it.each([{ members: [] }, { members: ['feature'] }])(
    'retains ordinary provider dependencies outside group members $members',
    ({ members }) => {
      const items = [
        ...providers.slice(0, 3),
        descriptor('feature'),
        descriptor('profile', '1.0.0', { a: '*', feature: '*' }),
      ];
      const result = selectDescriptorsWithProviders({
        items,
        getDescriptor: (x) => x,
        withDescriptor: (_, x) => x,
        getSelectionGroupMembers: (item) => (item.id === 'profile' ? members : undefined),
        seed: { selected: ['profile'], selectionSeed: false },
      });
      expect(result.providerSelection.slots[0]).toMatchObject({
        selectedProviderId: 'a',
        mode: 'dependency',
      });
    },
  );
  it('backtracks callback-only indirect members without retaining losing grouping members', () => {
    const items = [
      descriptor('app', '1.0.0', { profile: '*' }),
      descriptor('profile'),
      descriptor('profile', '2.0.0'),
      descriptor('feature'),
      descriptor('feature', '2.0.0', { missing: '*' }),
      descriptor('losing-member'),
    ];
    for (const order of [items, [...items].reverse()]) {
      const result = selectDescriptorsWithProviders({
        items: order,
        getDescriptor: (item) => item,
        withDescriptor: (_, item) => item,
        getSelectionGroupMembers: (item) =>
          item.id === 'profile'
            ? item.version === '2.0.0'
              ? ['missing', 'losing-member']
              : ['feature']
            : undefined,
        seed: { selected: ['app'], selectionSeed: false },
      });
      expect(identities(result.items)).toEqual(['app@1.0.0', 'feature@1.0.0', 'profile@1.0.0']);
    }
  });

  it.each(['app', 'profile'])(
    'retains explicit prerelease requirements for members reached through %s',
    (root) => {
      const result = selectDescriptorsWithProviders({
        items: [
          descriptor('app', '1.0.0', { profile: '*' }),
          descriptor('profile'),
          descriptor('feature', '1.0.0-beta.1'),
        ],
        getDescriptor: (item) => item,
        withDescriptor: (_, item) => item,
        getSelectionGroupMembers: (item) => (item.id === 'profile' ? ['feature'] : undefined),
        seed: { selected: [root, 'feature@1.0.0-beta.1'], selectionSeed: false },
      });
      expect(identities(result.items)).toContain('feature@1.0.0-beta.1');
    },
  );

  it('includes custom membership edges in activation and version backtracking', () => {
    const items = [
      descriptor('profile'),
      descriptor('feature', '1.0.0'),
      descriptor('feature', '2.0.0', { missing: '*' }),
    ];
    const result = selectDescriptorsWithProviders({
      items,
      getDescriptor: (x) => x,
      withDescriptor: (_, x) => x,
      getSelectionGroupMembers: (item) => (item.id === 'profile' ? ['feature'] : undefined),
      seed: { selected: ['profile'], selectionSeed: false },
    });
    expect(identities(result.items)).toEqual(['feature@1.0.0', 'profile@1.0.0']);
  });
});
