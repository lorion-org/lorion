import { describe, expect, it } from 'vitest';
import {
  resolveDescriptorSeed,
  resolveDescriptorSelection,
  selectDescriptorsWithProviders,
} from './index';
import type { Descriptor } from '@lorion-org/composition-graph';

const candidates: Descriptor[] = [
  { id: 'feature', version: '1.0.0' },
  { id: 'feature', version: '2.0.0' },
  { id: 'feature', version: '2.4.0' },
  { id: 'feature', version: '3.0.0-beta.2' },
];
function select(selected: string[], items = candidates) {
  return selectDescriptorsWithProviders({
    items,
    getDescriptor: (item) => item,
    withDescriptor: (_, item) => item,
    getSource: (item) => `/packages/${item.id}/${item.version}`,
    seed: { selected, selectionSeed: false },
  });
}

describe('versioned seeds', () => {
  it.each([
    ['feature', '2.4.0'],
    ['feature@*', '2.4.0'],
    ['feature@2', '2.4.0'],
    ['feature@^2.0.0', '2.4.0'],
    ['feature@~2.0.0', '2.0.0'],
    ['feature@2.0.0', '2.0.0'],
    ['feature@>=1 <2', '1.0.0'],
    ['feature@1 || 2', '2.4.0'],
    ['feature@1.0.0 - 2.0.0', '2.0.0'],
    ['feature@3.0.0-beta.2', '3.0.0-beta.2'],
    ['feature@^3.0.0-beta.1', '3.0.0-beta.2'],
  ])('selects %s as %s independent of candidate order', (spec, version) => {
    for (const items of [candidates, [...candidates].reverse()]) {
      const result = select([spec], items);
      expect(result.items).toEqual([{ id: 'feature', version }]);
      expect(result.seed.selected).toEqual(['feature']);
      expect(result.seed.requested).toEqual([spec]);
      expect(result.versions).toMatchObject([
        {
          id: 'feature',
          version,
          source: `/packages/feature/${version}`,
          requirements: [{ id: 'feature', source: 'seed.selected' }],
        },
      ]);
    }
  });

  it.each(['feature@', 'feature@beta', 'feature@latest', 'feature@not-a-range'])(
    'rejects invalid request %s',
    (spec) => {
      expect(() => select([spec])).toThrow(/Invalid version request.*SemVer range/);
    },
  );
  it('distinguishes unknown ids, unavailable versions and conflicting seed constraints', () => {
    expect(() => select(['missing@2'])).toThrow('Unknown selected descriptors: missing');
    expect(() => select(['feature@4'])).toThrow(
      /seed.selected requires feature@4.*Available: 3.0.0-beta.2, 2.4.0, 2.0.0, 1.0.0/,
    );
    expect(() => select(['feature@1', 'feature@2'])).toThrow(
      /seed.selected requires feature@1; seed.selected requires feature@2/,
    );
    expect(select(['feature@2', 'feature@^2.1']).items[0]?.version).toBe('2.4.0');
  });
  it('does not activate a prerelease through an unqualified root', () => {
    expect(() => select(['feature'], [candidates[3]!])).toThrow(
      /seed.selected requires feature@\*/,
    );
  });
  it.each(['>=1 <2', '1 || 2', '1.0.0 - 2.0.0', '^3.0.0-beta.1'])(
    'preserves range %s through CLI and env',
    (range) => {
      for (const selectionSeed of [
        { argv: [`--packages=feature@${range}, other`], env: {}, cliKeys: ['packages'] },
        { argv: ['--packages', `feature@${range}, other`], env: {}, cliKeys: ['packages'] },
        { argv: [], env: { FEATURES: `feature@${range}, other` }, envKeys: ['FEATURES'] },
      ]) {
        const resolved = resolveDescriptorSeed({ selectionSeed });
        expect(resolved.selected).toEqual(['feature', 'other']);
        expect(resolved.requirements).toEqual([
          { id: 'feature', range, source: 'seed.selectionSeed' },
          { id: 'other', range: '*', source: 'seed.selectionSeed' },
        ]);
      }
    },
  );
  it('preserves scoped ids and legacy whitespace-separated lists', () => {
    const seed = resolveDescriptorSeed({
      selectionSeed: {
        argv: ['--packages=@scope/feature@2 other@1 plain'],
        env: {},
        cliKeys: ['packages'],
      },
    });
    expect(seed.selected).toEqual(['@scope/feature', 'other', 'plain']);
    expect(seed.requirements.map(({ range }) => range)).toEqual(['2', '1', '*']);
    expect(
      resolveDescriptorSeed({ selected: ['@scope/feature'], selectionSeed: false }).selected,
    ).toEqual(['@scope/feature']);
  });
  it('applies explicit, CLI, env, default precedence and constrains the base too', () => {
    const selectionSeed = {
      argv: ['--packages=feature@2'],
      env: { FEATURES: 'feature@1' },
      cliKeys: ['packages'],
      envKeys: ['FEATURES'],
    };
    expect(
      resolveDescriptorSeed({ selected: ['feature@1'], selectionSeed }).requirements[0]?.range,
    ).toBe('1');
    expect(resolveDescriptorSeed({ selectionSeed }).requirements[0]?.range).toBe('2');
    expect(
      resolveDescriptorSeed({ selectionSeed: { ...selectionSeed, argv: [] } }).requirements[0]
        ?.range,
    ).toBe('1');
    const result = selectDescriptorsWithProviders({
      items: candidates,
      getDescriptor: (x) => x,
      withDescriptor: (_, x) => x,
      seed: {
        defaultSelection: ['feature@2'],
        baseDescriptors: ['feature@~2.0.0'],
        selectionSeed: false,
      },
    });
    expect(result.seed.requested).toBeNull();
    expect(result.seed.baseDescriptors).toEqual(['feature']);
    expect(result.items[0]?.version).toBe('2.0.0');
  });
  it.each([undefined, { resolutionRelationIds: [] }])(
    'always enforces explicit root ranges with policy %j',
    (policy) => {
      const result = selectDescriptorsWithProviders({
        items: candidates,
        getDescriptor: (x) => x,
        withDescriptor: (_, x) => x,
        seed: { selected: ['feature@1'], selectionSeed: false },
        ...(policy ? { policy } : {}),
      });
      expect(result.items[0]?.version).toBe('1.0.0');
    },
  );
  it('intersects JSON and seed requirements without overriding either', () => {
    const items = [
      ...candidates,
      { id: 'app', version: '1.0.0', dependencies: { feature: '^1.0.0' } },
    ];
    expect(() => select(['app', 'feature@2'], items)).toThrow(
      /app@1.0.0 requires feature@\^1.0.0; seed.selected requires feature@2/,
    );
    const result = select(['app', 'feature@1'], items);
    expect(result.versions.find((x) => x.id === 'feature')?.requirements).toEqual([
      { id: 'feature', range: '1', source: 'seed.selected' },
      { id: 'feature', range: '^1.0.0', source: 'app@1.0.0' },
    ]);
  });
  it('selects an explicit provider version without retaining the losing provider requirements', () => {
    const items: Descriptor[] = [
      { id: 'auth', version: '1.0.0' },
      { id: 'app', version: '1.0.0', dependencies: { old: '^1' } },
      { id: 'old', version: '1.0.0', providesFor: 'auth' },
      { id: 'new', version: '1.0.0', providesFor: 'auth' },
      { id: 'new', version: '2.0.0', providesFor: 'auth' },
    ];
    const result = select(['app', 'new@1'], items);
    expect(result.items.map((x) => `${x.id}@${x.version}`)).toEqual(['app@1.0.0', 'new@1.0.0']);
    expect(result.providerSelection.slots[0]).toMatchObject({
      selectedProviderId: 'new',
      mode: 'explicit',
    });
    expect(() => select(['old@1', 'new@1'], items)).toThrow(
      /at most one selected provider.*auth: new, old/,
    );
  });
});

describe('seed boundary and normalization invariants', () => {
  it.each(['selected', 'defaultSelection', 'baseDescriptors'] as const)(
    'validates %s as a list of nonempty requests',
    (field) => {
      for (const value of ['feature', [1], [''], ['  '], [null], ['feature', '']]) {
        expect(() =>
          resolveDescriptorSeed({ [field]: value, selectionSeed: false } as unknown as Parameters<
            typeof resolveDescriptorSeed
          >[0]),
        ).toThrow(new RegExp(`field "${field}"`));
      }
    },
  );
  it('normalizes request whitespace, duplicates and order without losing distinct ranges', () => {
    expect(
      resolveDescriptorSeed({
        selected: [' z@2 ', 'a@1', 'a@1', 'z@ 2 ', 'z@^2'],
        baseDescriptors: ['z@2', 'a@1', 'z@2'],
        selectionSeed: false,
      }),
    ).toEqual({
      requested: ['a@1', 'z@ 2', 'z@2', 'z@^2'],
      selected: ['a', 'z'],
      baseDescriptors: ['a', 'z'],
      requirements: [
        { id: 'a', range: '1', source: 'seed.selected' },
        { id: 'z', range: '2', source: 'seed.selected' },
        { id: 'z', range: '2', source: 'seed.selected' },
        { id: 'z', range: '^2', source: 'seed.selected' },
        { id: 'a', range: '1', source: 'seed.baseDescriptors' },
        { id: 'z', range: '2', source: 'seed.baseDescriptors' },
      ],
    });
    expect(
      resolveDescriptorSeed({ defaultSelection: ['z@2', 'a@1'], selectionSeed: false })
        .requirements,
    ).toEqual([
      { id: 'a', range: '1', source: 'seed.defaultSelection' },
      { id: 'z', range: '2', source: 'seed.defaultSelection' },
    ]);
  });
  it('uses default seed keys, honors custom logical keys and can disable environment sampling', () => {
    expect(
      resolveDescriptorSeed({
        selectionSeed: { argv: [], env: { LORION_CAPABILITIES: 'feature@1' } },
      }).selected,
    ).toEqual(['feature']);
    expect(
      resolveDescriptorSeed({ selectionSeed: { argv: ['--capabilities=feature@1'], env: {} } })
        .requirements[0]?.range,
    ).toBe('1');
    expect(
      resolveDescriptorSeed({
        selectionSeed: { key: 'feature', argv: [], env: { LORION_FEATURES: 'feature@2' } },
      }).requirements[0]?.range,
    ).toBe('2');
    const previous = process.env.LORION_CAPABILITIES;
    try {
      process.env.LORION_CAPABILITIES = 'feature@1';
      expect(resolveDescriptorSeed({ selectionSeed: false })).toEqual({
        requested: null,
        selected: [],
        baseDescriptors: [],
        requirements: [],
      });
      expect(resolveDescriptorSeed({ selectionSeed: { argv: [] } }).requested).toEqual([
        'feature@1',
      ]);
    } finally {
      if (previous === undefined) delete process.env.LORION_CAPABILITIES;
      else process.env.LORION_CAPABILITIES = previous;
    }
  });
  it('normalizes raw lists while preserving a full comparator range', () => {
    const result = resolveDescriptorSeed({
      selectionSeed: {
        argv: ['--packages= z@2, , a@>=1 <2, a@>=1 <2,,'],
        env: {},
        cliKeys: ['packages'],
      },
    });
    expect(result.requested).toEqual(['a@>=1 <2', 'z@2']);
    expect(result.selected).toEqual(['a', 'z']);
    expect(
      resolveDescriptorSeed({
        selectionSeed: { argv: ['--packages=  a\t\tz   '], env: {}, cliKeys: ['packages'] },
      }).requested,
    ).toEqual(['a', 'z']);
  });
});

describe('raw seed ambiguity boundaries', () => {
  it.each([
    ['feature@2 other', ['feature@2', 'other']],
    ['other feature@2', ['feature@2', 'other']],
    ['1 2', ['1', '2']],
    ['@1 2', ['2', '@1']],
  ])('retains separate requests in %s', (value, expected) => {
    const seed = resolveDescriptorSeed({
      selectionSeed: { argv: [], env: { LORION_CAPABILITIES: value } },
    });
    expect(seed.requested).toEqual(expected);
  });
  it('handles an absent raw seed and sorts ids separately from versioned specifications', () => {
    expect(resolveDescriptorSeed({ selectionSeed: { argv: [], env: {} } })).toEqual({
      requested: null,
      selected: [],
      baseDescriptors: [],
      requirements: [],
    });
    const input = {
      selected: ['a-child', 'a@2'],
      baseDescriptors: ['a-child', 'a@2'],
      selectionSeed: false as const,
    };
    expect(resolveDescriptorSeed(input).selected).toEqual(['a', 'a-child']);
    expect(resolveDescriptorSeed(input).baseDescriptors).toEqual(['a', 'a-child']);
    expect(resolveDescriptorSelection(input)).toEqual(['a', 'a-child']);
  });
});
