import { describe, expect, it, vi } from 'vitest';
import {
  createContributionRuntime,
  defineContribution,
  defineContributionPoint,
  ContributionError,
  type ContributionPlan,
  type ContributionModule,
  type ContributionErrorCode,
} from './index';

const point = defineContributionPoint<{ label: string }>({ owner: 'checkout', point: 'actions' });
const owner = { id: 'checkout', version: '2.0.0' };
const guest = { id: 'gift-wrap', version: '1.0.0' };
function plan(active = true): ContributionPlan {
  return {
    selected: active ? [owner, guest] : [guest],
    points: active ? [{ ...point, ownerVersion: owner.version }] : [],
    edges: [
      {
        source: guest,
        target: point,
        ...(active
          ? { active: true as const, ownerVersion: owner.version }
          : { active: false as const }),
      },
    ],
  };
}
function modules(): ContributionModule[] {
  return [
    {
      ...guest,
      create: () => ({
        contributions: [defineContribution(point, [{ id: 'wrap', value: { label: 'Gift wrap' } }])],
      }),
    },
    { ...owner, create: () => ({ points: [point] }) },
  ];
}
function reject(run: () => unknown, code: ContributionErrorCode): void {
  expect(run).toThrowError(matchingError({ name: 'ContributionError', code }));
}

describe('composition-bound contributions', () => {
  it('collects addressed items and reports exact identities without payloads', () => {
    const runtime = createContributionRuntime({ plan: plan(), modules: modules() });
    expect(runtime.get(point)).toEqual([{ id: 'wrap', value: { label: 'Gift wrap' }, order: 0 }]);
    expect(runtime.inspect()).toEqual([
      {
        source: guest,
        target: point,
        id: 'wrap',
        order: 0,
        status: 'active',
        ownerVersion: '2.0.0',
      },
    ]);
    expect(JSON.stringify(runtime.inspect())).not.toContain('Gift wrap');
  });
  it('keeps known unselected recipients inactive without requiring their implementation', () => {
    const runtime = createContributionRuntime({ plan: plan(false), modules: [modules()[0]!] });
    expect(runtime.get(point)).toEqual([]);
    expect(runtime.inspect()).toEqual([
      { source: guest, target: point, id: 'wrap', order: 0, status: 'owner-not-selected' },
    ]);
  });
  it('allows empty compositions, graph-only layers and empty/unknown lookups', () => {
    const runtime = createContributionRuntime({
      plan: { selected: [owner], points: [], edges: [] },
      modules: [],
    });
    expect(runtime.get(point)).toEqual([]);
    expect(runtime.inspect()).toEqual([]);
    expect(
      createContributionRuntime({ plan: { selected: [], points: [], edges: [] }, modules: [] }).get(
        point,
      ),
    ).toEqual([]);
  });
  it.each([
    { selected: [owner, owner], points: [], edges: [] },
    { selected: [], points: [{ ...point, ownerVersion: owner.version }], edges: [] },
    { ...plan(), points: [] },
    { ...plan(false), edges: [{ ...plan(false).edges[0], ownerVersion: owner.version }] },
    { ...plan(), edges: [plan().edges[0], plan().edges[0]] },
    { ...plan(), edges: [{ ...plan().edges[0], source: owner }] },
    {
      ...plan(false),
      edges: [{ ...plan(false).edges[0], source: { ...guest, version: '2.0.0' } }],
    },
    { ...plan(), edges: [{ ...plan().edges[0], active: false }] },
    { ...plan(), points: [plan().points[0], plan().points[0]] },
    { selected: null, points: [], edges: [] },
  ])('rejects malformed or contradictory plans before factories: %j', (invalid) => {
    const create = vi.fn();
    reject(
      () =>
        createContributionRuntime({
          plan: invalid as ContributionPlan,
          modules: [{ ...guest, create }],
        }),
      'INVALID_PLAN',
    );
    expect(create).not.toHaveBeenCalled();
  });
  it('checks every module identity before any factory executes', () => {
    const create = vi.fn();
    const supplied = [
      { ...owner, create },
      { ...guest, version: '9.0.0', create },
    ];
    reject(
      () => createContributionRuntime({ plan: plan(), modules: supplied }),
      'MODULE_IDENTITY_MISMATCH',
    );
    expect(create).not.toHaveBeenCalled();
    reject(
      () => createContributionRuntime({ plan: plan(), modules: [modules()[0]!, modules()[0]!] }),
      'DUPLICATE_MODULE',
    );
  });
  it('rejects an undeclared source/target address and a selected missing point', () => {
    reject(
      () => createContributionRuntime({ plan: { ...plan(), edges: [] }, modules: modules() }),
      'UNDECLARED_CONTRIBUTION',
    );
    reject(
      () => createContributionRuntime({ plan: plan(), modules: [modules()[0]!] }),
      'MISSING_POINT_IMPLEMENTATION',
    );
    const supplied = modules();
    supplied[1] = { ...owner, create: () => ({ points: [point, point] }) };
    reject(() => createContributionRuntime({ plan: plan(), modules: supplied }), 'DUPLICATE_POINT');
    supplied[1] = { ...owner, create: () => ({ points: [{ owner: 'wrong', point: 'actions' }] }) };
    reject(() => createContributionRuntime({ plan: plan(), modules: supplied }), 'INVALID_POINT');
  });
  it.each([
    {},
    { id: '' },
    { id: 'x' },
    { id: 'x', value: 0, order: Infinity },
    { id: 'x', value: 0, order: NaN },
    { id: 'x', value: 0, order: '1' },
  ])('rejects malformed items without reporting payload values', (item) => {
    const supplied: ContributionModule[] = [
      { ...guest, create: () => ({ contributions: [{ target: point, items: [item] as never }] }) },
    ];
    reject(
      () => createContributionRuntime({ plan: plan(false), modules: supplied }),
      'INVALID_ITEM',
    );
  });
  it('permits an explicitly supplied undefined payload', () => {
    const supplied: ContributionModule[] = [
      {
        ...guest,
        create: () => ({
          contributions: [{ target: point, items: [{ id: 'x', value: undefined }] }],
        }),
      },
      modules()[1]!,
    ];
    expect(
      createContributionRuntime({ plan: plan(), modules: supplied }).get(point)[0]!.value,
    ).toBeUndefined();
  });
  it('rejects duplicate active items while retaining inactive multiplicity', () => {
    const supplied = modules();
    const first = supplied[0]!;
    supplied[0] = {
      ...guest,
      create: () => ({
        contributions: [...first.create().contributions!, ...first.create().contributions!],
      }),
    };
    reject(() => createContributionRuntime({ plan: plan(), modules: supplied }), 'DUPLICATE_ITEM');
    expect(
      createContributionRuntime({ plan: plan(false), modules: [supplied[0]] }).inspect(),
    ).toHaveLength(2);
  });
  it('orders across contributors independently of declaration order, with per-address IDs', () => {
    const other = { id: 'aaa', version: '1.0.0' };
    const second = defineContributionPoint<string>({ owner: owner.id, point: 'other' });
    const p: ContributionPlan = {
      selected: [guest, owner, other],
      points: [
        { ...point, ownerVersion: owner.version },
        { ...second, ownerVersion: owner.version },
      ],
      edges: [
        plan().edges[0]!,
        { source: other, target: point, active: true, ownerVersion: owner.version },
        { source: guest, target: second, active: true, ownerVersion: owner.version },
      ],
    };
    const supplied: ContributionModule[] = [
      { ...owner, create: () => ({ points: [point, second] }) },
      {
        ...other,
        create: () => ({
          contributions: [defineContribution(point, [{ id: 'z', value: { label: 'first tie' } }])],
        }),
      },
      {
        ...guest,
        create: () => ({
          contributions: [
            defineContribution(point, [
              { id: 'b', value: { label: 'b' } },
              { id: 'a', value: { label: 'a' } },
              { id: 'negative', value: { label: 'earliest' }, order: -1 },
            ]),
            defineContribution(second, [{ id: 'a', value: 'other address' }]),
          ],
        }),
      },
    ];
    const normal = createContributionRuntime({ plan: p, modules: supplied });
    const reverse = createContributionRuntime({ plan: p, modules: [...supplied].reverse() });
    expect(normal.get(point).map(({ id }) => id)).toEqual(['negative', 'z', 'a', 'b']);
    expect(reverse.get(point)).toEqual(normal.get(point));
    expect(reverse.inspect()).toEqual(normal.inspect());
    expect(normal.get(second)[0]!.id).toBe('a');
  });
  it('isolates structural snapshots and factory-owned payloads', () => {
    const p = plan();
    const supplied = modules();
    const first = createContributionRuntime({ plan: p, modules: supplied });
    const second = createContributionRuntime({ plan: p, modules: supplied });
    first.get(point)[0]!.value.label = 'changed';
    expect(second.get(point)[0]!.value.label).toBe('Gift wrap');
    expect(() => {
      (first.get(point) as unknown[]).push(null);
    }).toThrow();
    expect(() => {
      (first.get(point)[0] as { id: string }).id = 'changed';
    }).toThrow();
    expect(() => {
      (first.inspect()[0]!.target as { point: string }).point = 'changed';
    }).toThrow();
    (p.selected as unknown[]).length = 0;
    supplied.length = 0;
    expect(first.get(point)).toHaveLength(1);
  });
  it('reports factory failures without leaking their cause into structural details', () => {
    const secret = 'private-fixture-value';
    const cause = new Error(secret);
    try {
      createContributionRuntime({
        plan: plan(),
        modules: [
          {
            ...guest,
            create: () => {
              throw cause;
            },
          },
        ],
      });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ContributionError);
      expect((error as Error).cause).toBe(cause);
      expect(JSON.stringify(error)).not.toContain(secret);
    }
  });
  it('rejects async factory misuse without an unhandled rejection', async () => {
    const supplied = [
      {
        ...guest,
        create: async () => {
          await Promise.resolve();
          throw new Error('async misuse');
        },
      },
    ] as unknown as ContributionModule[];
    reject(
      () => createContributionRuntime({ plan: plan(false), modules: supplied }),
      'INVALID_MODULE',
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

it('filters malformed public diagnostic fields and copies valid structural details', () => {
  const secret = { private: 'PRIVATE_MARKER' };
  const invalid = new ContributionError('INVALID_PLAN', {
    source: { id: secret, version: '1' },
    target: { owner: 'a', point: secret },
    itemId: secret,
    expectedVersion: secret,
    conflicts: [secret, { id: 'a', version: secret }],
  } as never);
  expect(invalid.details).toEqual({ conflicts: [] });
  expect(JSON.stringify(invalid)).not.toContain('PRIVATE_MARKER');
  const source = { id: 'a', version: '1' };
  const target = { owner: 'b', point: 'x' };
  const valid = new ContributionError('DUPLICATE_ITEM', {
    source,
    target,
    itemId: 'x',
    expectedVersion: '2',
    conflicts: [source],
  });
  source.id = 'changed';
  target.point = 'changed';
  expect(valid.details).toEqual({
    source: { id: 'a', version: '1' },
    target: { owner: 'b', point: 'x' },
    itemId: 'x',
    expectedVersion: '2',
    conflicts: [{ id: 'a', version: '1' }],
  });
  expect(Object.isFrozen(valid.details.conflicts?.[0])).toBe(true);
});

describe('adversarial input and diagnostic boundaries', () => {
  it.each([
    null,
    undefined,
    [],
    { owner: '', point: 'x' },
    { owner: 'a', point: '' },
    { owner: {}, point: 'x' },
  ])('rejects malformed point references: %j', (value) => {
    reject(() => defineContributionPoint(value as never), 'INVALID_POINT');
  });
  it.each([null, [], { plan: plan(), modules: null }, { plan: plan(), modules: {} }])(
    'rejects malformed runtime inputs: %j',
    (input) => {
      reject(
        () => createContributionRuntime(input as never),
        input && !Array.isArray(input) ? 'INVALID_MODULE' : 'INVALID_PLAN',
      );
    },
  );
  it.each([
    null,
    {},
    { ...guest, create: 1 },
    { id: '', version: guest.version, create: () => ({}) },
  ])('rejects malformed modules: %j', (module) => {
    reject(
      () => createContributionRuntime({ plan: plan(), modules: [module] as never }),
      'INVALID_MODULE',
    );
  });
  it.each([null, [], 1, { points: {} }, { contributions: {} }])(
    'rejects malformed factory results: %j',
    (result) => {
      expect(() =>
        createContributionRuntime({
          plan: plan(),
          modules: [{ ...guest, create: () => result } as never],
        }),
      ).toThrowError(matchingError({ code: 'INVALID_MODULE', details: { source: guest } }));
    },
  );
  it.each([
    { ...plan(), points: [{ ...point, ownerVersion: '' }] },
    { ...plan(), points: [{ owner: owner.id, point: {}, ownerVersion: owner.version }] },
    { ...plan(), edges: [null] },
    { ...plan(), edges: [{ ...plan().edges[0], source: { id: 'unknown', version: '1' } }] },
    { ...plan(), edges: [{ ...plan().edges[0], source: { id: guest.id, version: '' } }] },
    { ...plan(), edges: [{ ...plan().edges[0], target: { owner: 'unknown', point: 'actions' } }] },
    { ...plan(), edges: [{ ...plan().edges[0], target: { owner: owner.id, point: '' } }] },
    { ...plan(), edges: [{ ...plan().edges[0], ownerVersion: '' }] },
    { ...plan(), edges: [{ ...plan().edges[0], ownerVersion: '9' }] },
    { ...plan(), edges: [{ ...plan().edges[0], active: 1 }] },
  ])('rejects invalid graph structures: %j', (p) => {
    reject(() => createContributionRuntime({ plan: p as never, modules: [] }), 'INVALID_PLAN');
  });
  it.each([null, { target: { owner: '', point: 'actions' } }])(
    'rejects invalid submitted addresses: %j',
    (contribution) => {
      expect(() =>
        createContributionRuntime({
          plan: plan(),
          modules: [{ ...guest, create: () => ({ contributions: [contribution] as never }) }],
        }),
      ).toThrowError(
        matchingError({ code: 'UNDECLARED_CONTRIBUTION', details: { source: guest } }),
      );
    },
  );
  it('retains safe details for invalid declarations, identities and factory failures', () => {
    const check = (module: ContributionModule, code: ContributionErrorCode, details: unknown) =>
      expect(() => createContributionRuntime({ plan: plan(), modules: [module] })).toThrowError(
        matchingError({ code, details }),
      );
    check(
      { ...guest, create: () => ({ contributions: [{ target: point, items: {} } as never] }) },
      'INVALID_ITEM',
      { source: guest, target: point },
    );
    check({ ...owner, create: () => ({ points: [null] as never }) }, 'INVALID_POINT', {
      source: owner,
    });
    check(
      { ...owner, create: () => ({ points: [{ owner: owner.id, point: 'undeclared' }] }) },
      'INVALID_POINT',
      { source: owner, target: { owner: owner.id, point: 'undeclared' } },
    );
    check({ ...guest, version: '9', create: () => ({}) }, 'MODULE_IDENTITY_MISMATCH', {
      source: { ...guest, version: '9' },
      expectedVersion: guest.version,
    });
    check({ id: 'not-selected', version: '1', create: () => ({}) }, 'MODULE_IDENTITY_MISMATCH', {
      source: { id: 'not-selected', version: '1' },
    });
    check(
      {
        ...guest,
        create: () => {
          throw new Error('private');
        },
      },
      'MODULE_FACTORY_FAILED',
      { source: guest },
    );
  });
  it('invokes factories in code-unit order and stops at the first failure', () => {
    const called: string[] = [];
    const ids = ['z', 'A', 'a'];
    const p: ContributionPlan = {
      selected: ids.map((id) => ({ id, version: '1' })),
      points: [],
      edges: [],
    };
    const supplied = ids.map((id) => ({
      id,
      version: '1',
      create: () => {
        called.push(id);
        if (id === 'a') throw new Error('stop');
        return {};
      },
    }));
    reject(
      () => createContributionRuntime({ plan: p, modules: supplied }),
      'MODULE_FACTORY_FAILED',
    );
    expect(called).toEqual(['A', 'a']);
  });
  it('preserves inspection order across addresses, equal-order sources and equal-source item IDs', () => {
    const targets = [
      { owner: 'z', point: 'x' },
      { owner: 'A', point: 'z' },
      { owner: 'A', point: 'a' },
    ];
    const sources = [
      { id: 'z-source', version: '1' },
      { id: 'A-source', version: '1' },
    ];
    const p: ContributionPlan = {
      selected: sources,
      points: [],
      edges: sources.flatMap((source) =>
        targets.map((target) => ({ source, target, active: false as const })),
      ),
    };
    const supplied: ContributionModule[] = sources.map((source) => ({
      ...source,
      create: () => ({
        contributions: targets.map((target) => ({
          target,
          items: [
            { id: 'z', value: 1 },
            { id: 'a', value: 2 },
            { id: 'early', value: 3, order: -1 },
          ],
        })),
      }),
    }));
    const rows = createContributionRuntime({ plan: p, modules: supplied }).inspect();
    expect(rows.map((row) => [row.target.owner, row.target.point, row.source.id, row.id])).toEqual(
      [
        { owner: 'A', point: 'a' },
        { owner: 'A', point: 'z' },
        { owner: 'z', point: 'x' },
      ].flatMap((target) =>
        [
          ['A-source', 'early'],
          ['z-source', 'early'],
          ['A-source', 'a'],
          ['A-source', 'z'],
          ['z-source', 'a'],
          ['z-source', 'z'],
        ].map(([source, id]) => [target.owner, target.point, source, id]),
      ),
    );
  });
  it('rejects unknown public error codes', () => {
    for (const code of ['', 'toString', null, 1])
      expect(() => new ContributionError(code as never)).toThrow(TypeError);
  });
});

function matchingError(value: Record<string, unknown>): Error {
  return expect.objectContaining(value) as Error;
}

it('reports both conflicting identities and preserves nonzero numeric ordering', () => {
  const extra = { id: 'aaa', version: '1.0.0' };
  const p: ContributionPlan = {
    ...plan(),
    selected: [...plan().selected, extra],
    edges: [
      ...plan().edges,
      { source: extra, target: point, active: true, ownerVersion: owner.version },
    ],
  };
  const supplied: ContributionModule[] = [
    ...modules(),
    {
      ...extra,
      create: () => ({
        contributions: [defineContribution(point, [{ id: 'wrap', value: { label: 'conflict' } }])],
      }),
    },
  ];
  expect(() => createContributionRuntime({ plan: p, modules: supplied })).toThrowError(
    matchingError({
      code: 'DUPLICATE_ITEM',
      details: { source: guest, target: point, itemId: 'wrap', conflicts: [extra, guest] },
    }),
  );
  const ordered: ContributionModule[] = [
    modules()[1]!,
    {
      ...guest,
      create: () => ({
        contributions: [
          defineContribution(point, [
            { id: 'later', order: 20, value: { label: 'later' } },
            { id: 'earlier', order: 10, value: { label: 'earlier' } },
          ]),
        ],
      }),
    },
  ];
  expect(
    createContributionRuntime({ plan: plan(), modules: ordered })
      .get(point)
      .map(({ id }) => id),
  ).toEqual(['earlier', 'later']);
});
it('keeps structural error details for module and point duplicates and missing implementations', () => {
  expect(() =>
    createContributionRuntime({ plan: plan(), modules: [modules()[0]!, modules()[0]!] }),
  ).toThrowError(matchingError({ code: 'DUPLICATE_MODULE', details: { source: guest } }));
  expect(() =>
    createContributionRuntime({
      plan: plan(),
      modules: [{ ...owner, create: () => ({ points: [point, point] }) }],
    }),
  ).toThrowError(
    matchingError({ code: 'DUPLICATE_POINT', details: { source: owner, target: point } }),
  );
  expect(() => createContributionRuntime({ plan: plan(), modules: [modules()[0]!] })).toThrowError(
    matchingError({
      code: 'MISSING_POINT_IMPLEMENTATION',
      details: { source: guest, target: point, itemId: 'wrap' },
    }),
  );
});
it('rejects a foreign declaration even when the foreign point exists in the plan', () => {
  const foreign = { id: 'foreign', version: '1.0.0' };
  const target = { owner: foreign.id, point: 'actions' };
  const p: ContributionPlan = {
    ...plan(),
    selected: [...plan().selected, foreign],
    points: [...plan().points, { ...target, ownerVersion: foreign.version }],
  };
  reject(
    () =>
      createContributionRuntime({
        plan: p,
        modules: [{ ...owner, create: () => ({ points: [target] }) }],
      }),
    'INVALID_POINT',
  );
});
it('rejects async factories with structural identity and item arrays with object-like metadata', async () => {
  expect(() =>
    createContributionRuntime({
      plan: plan(false),
      modules: [{ ...guest, create: () => Promise.resolve({}) } as never],
    }),
  ).toThrowError(matchingError({ code: 'INVALID_MODULE', details: { source: guest } }));
  const item = Object.assign([], { id: 'bad', value: 'array' });
  reject(
    () =>
      createContributionRuntime({
        plan: plan(false),
        modules: [
          { ...guest, create: () => ({ contributions: [{ target: point, items: [item] }] }) },
        ],
      }),
    'INVALID_ITEM',
  );
  await Promise.resolve();
});

it('requires primitive codes, nonempty plan point names, and literal edge activation', () => {
  expect(
    () =>
      new ContributionError({ toString: () => 'INVALID_PLAN', private: 'PRIVATE_MARKER' } as never),
  ).toThrow(TypeError);
  reject(
    () =>
      createContributionRuntime({
        plan: {
          selected: [owner],
          points: [{ owner: owner.id, point: '', ownerVersion: owner.version }],
          edges: [],
        },
        modules: [],
      }),
    'INVALID_PLAN',
  );
  reject(
    () =>
      createContributionRuntime({
        plan: { ...plan(false), edges: [{ ...plan(false).edges[0], active: null }] as never },
        modules: [],
      }),
    'INVALID_PLAN',
  );
});
it('does not mistake unrelated result metadata for a promise', () => {
  expect(
    createContributionRuntime({
      plan: plan(false),
      modules: [{ ...guest, create: () => ({ points: [], then: 'ordinary metadata' }) }],
    }).inspect(),
  ).toEqual([]);
});

it.each([
  { item: { id: 'known-item', value: 'PRIVATE_VALUE', order: NaN }, itemId: 'known-item' },
  { item: { id: 'known-item' }, itemId: 'known-item' },
  { item: { id: '', value: 'PRIVATE_VALUE', order: Infinity }, itemId: undefined },
  { item: { id: { private: 'PRIVATE_VALUE' }, value: 1 }, itemId: undefined },
  { item: null, itemId: undefined },
])('identifies only safe available invalid-item IDs: $item', ({ item, itemId }) => {
  try {
    createContributionRuntime({
      plan: plan(false),
      modules: [
        {
          ...guest,
          create: () => ({ contributions: [{ target: point, items: [item] as never }] }),
        },
      ],
    });
    expect.fail('Expected invalid item rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(ContributionError);
    expect((error as ContributionError).code).toBe('INVALID_ITEM');
    expect((error as ContributionError).details).toEqual({
      source: guest,
      target: point,
      ...(itemId ? { itemId } : {}),
    });
    expect(JSON.stringify(error)).not.toContain('PRIVATE_VALUE');
  }
});
