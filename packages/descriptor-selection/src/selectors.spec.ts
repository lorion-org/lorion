import { describe, expect, it, vi } from 'vitest';
import type { Descriptor } from '@lorion-org/composition-graph';
import {
  resolveDescriptorSeed,
  selectDescriptorsWithProviders,
  type DescriptorSelectionSeed,
} from './index';
import policy from '../snippets/version-policy.json';
import { resolveNamedVersionRequirements } from './selectors';

const inventory: Descriptor[] = [
  { id: 'search', version: '1.0.0' },
  { id: 'search', version: '2.0.0' },
  { id: 'search', version: '2.0.0-beta.2', dependencies: { shared: '1' } },
  { id: 'search', version: '3.0.0-beta.10', dependencies: { shared: '2' } },
  { id: 'search', version: '4.0.0-alpha.1' },
  { id: 'search', version: '5.0.0-beta.1', disabled: true },
  { id: 'shared', version: '1.0.0' },
  { id: 'shared', version: '2.0.0' },
  { id: 'app', version: '1.0.0', dependencies: { shared: '1' } },
];
const versionSelectors: NonNullable<DescriptorSelectionSeed['versionSelectors']> = {
  beta: ({ prerelease }) => prerelease[0] === 'beta',
  experimental: ({ prerelease }) => prerelease[0] === 'beta',
  stable: ({ prerelease }) => prerelease.length === 0,
};
function select(seed: DescriptorSelectionSeed, items = inventory) {
  return selectDescriptorsWithProviders({
    items,
    getDescriptor: (x) => x,
    withDescriptor: (_, x) => x,
    getSource: (x) => `packages/${x.id}/${x.version}`,
    seed: { selectionSeed: false, versionSelectors, ...seed },
  });
}
const chosen = (result: ReturnType<typeof select>, id = 'search') =>
  result.items.find((x) => x.id === id)?.version;

describe('caller-defined version selectors', () => {
  it('selects the highest matching enabled candidate and reports the original request and effective restriction', () => {
    for (const items of [inventory, [...inventory].reverse()]) {
      const result = select({ selected: ['search@experimental'] }, items);
      expect(chosen(result)).toBe('3.0.0-beta.10');
      expect(result.seed.requested).toEqual(['search@experimental']);
      const requirement = {
        id: 'search',
        source: 'seed.selected',
        selector: 'experimental',
        range: '3.0.0-beta.10 || 2.0.0-beta.2',
        versions: ['3.0.0-beta.10', '2.0.0-beta.2'],
      };
      expect(result.versions.find((x) => x.id === 'search')?.requirements).toEqual([requirement]);
      expect(result.seed.requirements).toEqual([requirement]);
      expect(JSON.stringify(result)).not.toContain('prerelease[0]');
    }
  });
  it('keeps native numeric prerelease ordering', () => {
    expect(
      chosen(
        select({ selected: ['search@beta'] }, [
          { id: 'search', version: '1.0.0-beta.2' },
          { id: 'search', version: '1.0.0-beta.10' },
        ]),
      ),
    ).toBe('1.0.0-beta.10');
  });
  it('uses caller-owned JSON membership without assigning meaning to the selector name', () => {
    const items: Descriptor[] = [
      ...policy.curated,
      { id: 'search', version: '2.0.0-beta.1+other' },
      { id: 'search', version: '3.0.0-beta.2' },
    ];
    const seed: DescriptorSelectionSeed = {
      selected: ['search@curated'],
      versionSelectors: {
        curated: ({ id, version }) =>
          policy.curated.some((candidate) => candidate.id === id && candidate.version === version),
      },
    };
    for (const ordering of [items, [...items].reverse()]) {
      const result = select(seed, ordering);
      expect(chosen(result)).toBe('2.0.0-beta.1+reviewed');
      expect(result.seed.requirements[0]?.versions).toEqual(['2.0.0-beta.1+reviewed', '1.0.0']);
      expect(chosen(select({ ...seed, selected: ['search@curated', 'search@1'] }, ordering))).toBe(
        '1.0.0',
      );
    }
  });
  it('uses version order rather than stable preference within a mixed eligible set', () => {
    const items: Descriptor[] = [
      { id: 'search', version: '2.0.0' },
      { id: 'search', version: '3.0.0-beta.1' },
    ];
    const seed: DescriptorSelectionSeed = {
      selected: ['search@mixed'],
      versionSelectors: { mixed: () => true },
    };
    expect(chosen(select(seed, items))).toBe('3.0.0-beta.1');
    expect(chosen(select({ ...seed, selected: ['search'] }, items))).toBe('2.0.0');
  });
  it('repeats a selection from unchanged policy and catalog inputs', () => {
    const seed = { selected: ['app', 'search@beta'] };
    const first = select(seed);
    const otherHost = select({
      selected: ['search@beta'],
      versionSelectors: { beta: ({ prerelease }) => prerelease.length === 0 },
    });
    expect(chosen(otherHost)).toBe('2.0.0');
    const repeated = select(seed, [...inventory].reverse());
    expect(repeated.items).toEqual(first.items);
    expect(repeated.seed).toEqual(first.seed);
    expect(repeated.versions).toEqual(first.versions);
  });
  it('retains stable selection when the caller supplies no registry', () => {
    const result = selectDescriptorsWithProviders({
      items: inventory,
      getDescriptor: (item) => item,
      withDescriptor: (_item, descriptor) => descriptor,
      seed: { selected: ['search'], selectionSeed: false },
    });
    expect(chosen(result)).toBe('2.0.0');
    expect(result.seed.requirements).toEqual([
      { id: 'search', range: '*', source: 'seed.selected' },
    ]);
  });
  it('backtracks within the channel without reevaluating the predicate', () => {
    const predicate = vi.fn(versionSelectors.beta);
    const result = select({
      selected: ['app', 'search@beta'],
      versionSelectors: { beta: predicate },
    });
    expect(chosen(result)).toBe('2.0.0-beta.2');
    expect(predicate).toHaveBeenCalledTimes(5);
    expect(predicate.mock.calls.map(([x]) => x.version)).not.toContain('5.0.0-beta.1');
  });
  it('captures repeated selected and base requests once while retaining both provenances', () => {
    const predicate = vi.fn(versionSelectors.beta);
    const result = select({
      selected: ['search@beta'],
      baseDescriptors: ['search@beta'],
      versionSelectors: { beta: predicate },
    });
    expect(predicate).toHaveBeenCalledTimes(5);
    expect(result.seed.requirements.map(({ source }) => source)).toEqual([
      'seed.selected',
      'seed.baseDescriptors',
    ]);
    expect(result.seed.requirements[0]?.versions).toEqual(result.seed.requirements[1]?.versions);
  });
  it("reports only the requested id's enabled versions in an empty channel", () => {
    expect(() =>
      select({ selected: ['search@empty'], versionSelectors: { empty: () => false } }),
    ).toThrow(
      'No enabled versions match selector "empty" for "search". Available: 4.0.0-alpha.1, 3.0.0-beta.10, 2.0.0, 2.0.0-beta.2, 1.0.0.',
    );
  });
  it('keeps eligible version reporting deterministic across equal-precedence build variants', () => {
    const items = [
      { id: 'search', version: '1.0.0+z' },
      { id: 'search', version: '1.0.0+a' },
      { id: 'search', version: '1.0.0+m' },
    ];
    for (const ordering of [items, [...items].reverse()]) {
      const result = select(
        { selected: ['search@all'], versionSelectors: { all: () => true } },
        ordering,
      );
      expect(chosen(result)).toBe('1.0.0+a');
      expect(result.seed.requirements[0]?.versions).toEqual(['1.0.0+a', '1.0.0+m', '1.0.0+z']);
    }
  });
  it('keeps membership order deterministic when ids and equal-precedence builds are interleaved', () => {
    const items = [
      { id: 'alpha', version: '1.0.0+a' },
      { id: 'alpha', version: '2.0.0' },
      { id: 'zeta', version: '2.0.0' },
      { id: 'alpha', version: '1.0.0+z' },
      { id: 'zeta', version: '1.0.0+a' },
      { id: 'zeta', version: '1.0.0+z' },
    ];
    for (const order of [items, [...items].reverse()]) {
      const result = select(
        { selected: ['alpha@all', 'zeta@all'], versionSelectors: { all: () => true } },
        order,
      );
      expect(result.seed.requirements.map(({ id, versions }) => ({ id, versions }))).toEqual([
        { id: 'alpha', versions: ['2.0.0', '1.0.0+a', '1.0.0+z'] },
        { id: 'zeta', versions: ['2.0.0', '1.0.0+a', '1.0.0+z'] },
      ]);
    }
  });

  it('reports the same malformed registry entry regardless of registration order', () => {
    for (const registry of [
      { zeta: 'invalid', alpha: 'invalid' },
      { alpha: 'invalid', zeta: 'invalid' },
    ]) {
      expect(() =>
        resolveDescriptorSeed({ versionSelectors: registry } as unknown as DescriptorSelectionSeed),
      ).toThrowError(new TypeError('Version selector "alpha" must be a synchronous predicate.'));
    }
  });
  it('intersects selectors, ranges, base requirements and active JSON constraints', () => {
    const result = select({
      selected: ['search@beta', 'search@^2.0.0-beta.1'],
      baseDescriptors: ['search@experimental'],
    });
    expect(chosen(result)).toBe('2.0.0-beta.2');
    expect(result.versions.find((x) => x.id === 'search')?.requirements).toHaveLength(3);
    const items = [
      ...inventory,
      { id: 'consumer', version: '1.0.0', dependencies: { search: '^2.0.0-beta.1' } },
    ];
    expect(chosen(select({ selected: ['consumer', 'search@beta'] }, items))).toBe('2.0.0-beta.2');
    expect(() => select({ selected: ['search@beta', 'search@stable'] })).toThrow(
      /No compatible version.*search@beta.*search@stable/,
    );
  });
  it('does not change stable defaults or turn ordinary dependencies into prerelease opt-in', () => {
    expect(chosen(select({ selected: ['search'] }))).toBe('2.0.0');
    expect(() => select({ selected: ['search', 'search@beta'] })).toThrow(/No compatible version/);
    const items = [
      ...inventory,
      { id: 'consumer', version: '1.0.0', dependencies: { search: '2' } },
    ];
    expect(() => select({ selected: ['consumer', 'search@beta'] }, items)).toThrow(
      /consumer@1.0.0 requires search@2/,
    );
    const escaping = [
      ...inventory,
      { id: 'consumer', version: '1.0.0', dependencies: { search: '1' } },
    ];
    expect(() => select({ selected: ['consumer', 'search@beta'] }, escaping)).toThrow(
      /No compatible version/,
    );
  });
  it('keeps exact candidate membership when SemVer build metadata has equal precedence', () => {
    const result = select(
      {
        selected: ['search@approved'],
        versionSelectors: { approved: (x) => x.version.endsWith('+z-approved') },
      },
      [
        { id: 'search', version: '1.0.0+z-approved' },
        { id: 'search', version: '1.0.0+a-other' },
      ],
    );
    expect(chosen(result)).toBe('1.0.0+z-approved');
    expect(result.versions[0]?.requirements[0]?.versions).toEqual(['1.0.0+z-approved']);
  });
  it.each([
    { selected: ['@acme/search@beta'] },
    { selectionSeed: { argv: ['--packages=@acme/search@beta'], env: {}, cliKeys: ['packages'] } },
    { selectionSeed: { argv: [], env: { PICK: '@acme/search@beta' }, envKeys: ['PICK'] } },
    { defaultSelection: ['@acme/search@beta'] },
    { baseDescriptors: ['@acme/search@beta'], selected: ['app'] },
  ])('supports every seed path and scoped ids: %j', (seed) => {
    const items = inventory.map((x) => (x.id === 'search' ? { ...x, id: '@acme/search' } : x));
    const result = select(seed, items);
    expect(chosen(result, '@acme/search')).toBe(
      seed.baseDescriptors ? '2.0.0-beta.2' : '3.0.0-beta.10',
    );
    expect(result.seed.requirements.some((x) => x.selector === 'beta')).toBe(true);
  });
  it('reports unknown names, empty channels and conflicting channels separately', () => {
    expect(() => select({ selected: ['search@missing'] })).toThrow(
      /Unknown selector or invalid range.*missing/,
    );
    expect(() =>
      select({ selected: ['search@canary'], versionSelectors: { canary: () => false } }),
    ).toThrow(/No enabled versions match selector "canary"/);
    expect(() => select({ selected: ['search@beta', 'search@1'] })).toThrow(
      /search@1.*search@beta \(3\.0\.0-beta\.10 \|\| 2\.0\.0-beta\.2\)/,
    );
  });
  it('rejects malformed registries and names that would shadow SemVer requests', () => {
    for (const name of ['', '2', 'v2', '*', 'x', 'a b', 'a,b', 'a@b']) {
      expect(() => resolveDescriptorSeed({ versionSelectors: { [name]: () => true } })).toThrow(
        /Invalid version selector name/,
      );
    }
    for (const value of [null, false, 0, '', [], true, { beta: '2' }]) {
      expect(() =>
        resolveDescriptorSeed({ versionSelectors: value } as unknown as DescriptorSelectionSeed),
      ).toThrow(/versionSelectors|Version selector/);
    }
    expect(() => select({ selected: ['search@toString'], versionSelectors: {} })).toThrow(
      /Invalid version request/,
    );
  });
  it('validates all identities before any selector runs and keeps candidate inputs immutable', () => {
    const predicate = vi.fn(() => true);
    expect(() =>
      select({ selected: ['search@anything'], versionSelectors: { anything: predicate } }, [
        { id: 'search', version: '1.0.0' },
        { id: 'search', version: '1.0.0', disabled: true },
      ]),
    ).toThrow(/Duplicate descriptor/);
    expect(predicate).not.toHaveBeenCalled();
    select({
      selected: ['search@anything'],
      versionSelectors: {
        anything: (candidate) => {
          expect(Object.isFrozen(candidate)).toBe(true);
          expect(Object.isFrozen(candidate.prerelease)).toBe(true);
          expect(Object.keys(candidate).sort()).toEqual(['id', 'prerelease', 'version']);
          return true;
        },
      },
    });
  });
  it('rejects asynchronous/nonboolean predicates and attributes factory failures without exposing their text', async () => {
    for (const predicate of [() => 'yes', () => Promise.reject(new Error('private rejection'))]) {
      expect(() =>
        select({
          selected: ['search@bad'],
          versionSelectors: { bad: predicate },
        } as unknown as DescriptorSelectionSeed),
      ).toThrow(/boolean synchronously/);
    }
    await Promise.resolve();
    const cause = new Error('private predicate detail');
    try {
      select({
        selected: ['search@bad'],
        versionSelectors: {
          bad: () => {
            throw cause;
          },
        },
      });
      expect.fail('Expected selector failure');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toMatch(/selector "bad" failed for search@/);
      expect((error as Error).message).not.toContain(cause.message);
      expect((error as Error).cause).toBe(cause);
    }
  });
  it('preserves provider priority and does not evaluate unrelated descriptors', () => {
    const items: Descriptor[] = [
      { id: 'auth', version: '1.0.0' },
      { id: 'old', version: '1.0.0', providesFor: 'auth', defaultFor: 'auth' },
      { id: 'new', version: '2.0.0-beta.1', providesFor: 'auth' },
      { id: 'new', version: '3.0.0-beta.1', providesFor: 'auth' },
    ];
    const result = select({ selected: ['auth', 'new@beta'] }, items);
    expect(chosen(result, 'new')).toBe('3.0.0-beta.1');
    expect(result.providerSelection.slots[0]).toMatchObject({
      mode: 'explicit',
      selectedProviderId: 'new',
    });
    expect(result.items.some((x) => x.id === 'old')).toBe(false);
  });
});

describe('named requirement validation', () => {
  it('attributes a missing predicate to the selector name at the internal boundary', () => {
    expect(() =>
      resolveNamedVersionRequirements({
        named: [{ id: 'feature', selector: 'missing', source: 'seed.selected' }],
        selectors: {},
        descriptors: [{ id: 'feature', version: '1.0.0' }],
      }),
    ).toThrowError(new Error('Unknown version selector "missing" for "feature".'));
  });

  it('reports no enabled candidates without evaluating a predicate', () => {
    const predicate = vi.fn(() => true);
    expect(() =>
      resolveNamedVersionRequirements({
        named: [{ id: 'feature', selector: 'curated', source: 'seed.selected' }],
        selectors: { curated: predicate },
        descriptors: [{ id: 'feature', version: '1.0.0', disabled: true }],
      }),
    ).toThrowError(
      new Error('No enabled versions match selector "curated" for "feature". Available: none.'),
    );
    expect(predicate).not.toHaveBeenCalled();
  });
});
