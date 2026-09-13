import { describe, expect, it } from 'vitest';

import {
  contributionRelationDescriptor,
  resolveContributions,
  resolveVersionedContributions,
} from './contributions';
import { createDescriptorCatalog, type Descriptor } from './index';

function descriptor(id: string, overrides: Partial<Descriptor> = {}): Descriptor {
  return { id, version: '1.0.0', ...overrides };
}

// A capability owner offering points, and two guests filling them.
const checkout = descriptor('checkout', { contributionPoints: ['payment-method', 'summary-row'] });
const invoice = descriptor('payment-provider-invoice', {
  dependencies: { checkout: '^1.0.0' },
  contributesTo: { checkout: 'payment-method' },
});
const loyalty = descriptor('loyalty', {
  contributesTo: { checkout: ['payment-method', 'summary-row'] },
});

describe('resolveContributions', () => {
  it('reads the declared relation in both directions', () => {
    const relations = resolveContributions([checkout, invoice, loyalty]);

    expect(relations.edges).toEqual([
      { from: 'payment-provider-invoice', to: 'checkout', point: 'payment-method' },
      { from: 'loyalty', to: 'checkout', point: 'payment-method' },
      { from: 'loyalty', to: 'checkout', point: 'summary-row' },
    ]);
    expect(relations.points('checkout')).toEqual(['payment-method', 'summary-row']);
    expect(relations.fills('loyalty').map((edge) => edge.point)).toEqual([
      'payment-method',
      'summary-row',
    ]);
    expect(relations.receives('checkout')).toHaveLength(3);
  });

  it('reports a point its owner does not declare, and what the owner does declare', () => {
    const typo = descriptor('loyalty', { contributesTo: { checkout: 'payment-metod' } });

    expect(() => resolveContributions([checkout, typo])).toThrow(
      /contributes "payment-metod" to "checkout", which declares "payment-method", "summary-row"/,
    );
  });

  it('reports an owner that is not a descriptor of this composition', () => {
    const orphan = descriptor('loyalty', { contributesTo: { chekout: 'payment-method' } });

    expect(() => resolveContributions([checkout, orphan])).toThrow(
      /contributes to "chekout", which is not a known descriptor/,
    );
  });

  it('reports a descriptor that offers no point but receives one', () => {
    const payments = descriptor('payments');
    const guest = descriptor('loyalty', { contributesTo: { payments: 'payment-method' } });

    expect(() => resolveContributions([payments, guest])).toThrow(
      /which declares no contribution point/,
    );
  });

  it('rejects a contribution to the contributor itself', () => {
    const self = descriptor('checkout', {
      contributionPoints: ['summary-row'],
      contributesTo: { checkout: 'summary-row' },
    });

    expect(() => resolveContributions([self])).toThrow(/contribution to itself/);
  });

  it('rejects shapes that carry no point name', () => {
    // Widened deliberately: the declared fields already exclude these shapes, and
    // the guard exists for the untyped caller a published package always has.
    const malformed = (fields: Record<string, unknown>): Descriptor => ({
      id: 'loyalty',
      version: '1.0.0',
      ...fields,
    });

    expect(() =>
      resolveContributions([checkout, malformed({ contributesTo: ['checkout'] })]),
    ).toThrow(/must map an owning descriptor/);
    expect(() =>
      resolveContributions([checkout, malformed({ contributesTo: { checkout: [] } })]),
    ).toThrow(/must name one contribution point or a list of them/);
    expect(() => resolveContributions([malformed({ contributionPoints: 'point' })])).toThrow(
      /must list non-empty point names/,
    );
  });

  it('takes a point name for a name, not for anything a JSON file can hold', () => {
    const malformed = (fields: Record<string, unknown>): Descriptor => ({
      id: 'loyalty',
      version: '1.0.0',
      ...fields,
    });

    expect(() => resolveContributions([malformed({ contributionPoints: [42] })])).toThrow(
      /must list non-empty point names/,
    );
    expect(() =>
      resolveContributions([checkout, malformed({ contributesTo: { checkout: [42] } })]),
    ).toThrow(/must name one contribution point or a list of them/);
    expect(() =>
      resolveContributions([checkout, malformed({ contributesTo: { checkout: '' } })]),
    ).toThrow(/must name one contribution point or a list of them/);
  });

  it('rejects a list in which one name among several is none', () => {
    // A bad entry next to good ones is the shape a hand-written descriptor produces,
    // and it must not pass because the rest of the list is fine.
    const malformed = (fields: Record<string, unknown>): Descriptor => ({
      id: 'loyalty',
      version: '1.0.0',
      ...fields,
    });

    expect(() =>
      resolveContributions([malformed({ contributionPoints: ['summary-row', 42] })]),
    ).toThrow(/must list non-empty point names/);
    // An empty name is no name: it would read as a point every guest may fill.
    expect(() =>
      resolveContributions([malformed({ contributionPoints: ['summary-row', ''] })]),
    ).toThrow(/must list non-empty point names/);
    expect(() =>
      resolveContributions([
        checkout,
        malformed({ contributesTo: { checkout: ['payment-method', ''] } }),
      ]),
    ).toThrow(/must name one contribution point or a list of them/);
  });

  it('takes the contribution field for a map of owners, and nothing else', () => {
    const malformed = (fields: Record<string, unknown>): Descriptor => ({
      id: 'loyalty',
      version: '1.0.0',
      ...fields,
    });

    for (const declared of [null, 42, 'checkout', true]) {
      expect(() =>
        resolveContributions([checkout, malformed({ contributesTo: declared })]),
      ).toThrow(/must map an owning descriptor/);
    }
  });

  it('answers with nothing for a descriptor that neither offers nor fills a point', () => {
    const relations = resolveContributions([checkout, invoice, descriptor('payments')]);

    expect(relations.points('payments')).toEqual([]);
    expect(relations.fills('payments')).toEqual([]);
    expect(relations.receives('payments')).toEqual([]);
    // An id the composition does not hold at all answers the same way.
    expect(relations.points('absent')).toEqual([]);
    expect(relations.fills('absent')).toEqual([]);
    expect(relations.receives('absent')).toEqual([]);
  });

  it('reads the field names a host spells differently', () => {
    const owner = descriptor('checkout', { extensionPoints: ['payment-method'] });
    const guest = descriptor('loyalty', { extends: { checkout: 'payment-method' } });

    const relations = resolveContributions([owner, guest], {
      field: 'extends',
      pointField: 'extensionPoints',
    });

    expect(relations.edges).toEqual([{ from: 'loyalty', to: 'checkout', point: 'payment-method' }]);
  });

  it('walks as a graph relation without changing what resolves', () => {
    const relation = contributionRelationDescriptor();
    const catalog = createDescriptorCatalog({
      descriptors: [checkout, invoice, loyalty],
      relationDescriptors: [relation],
    });

    expect(relation.roles).toEqual(['inspection']);
    expect(relation.id).toBe('contributions');
    // The edge addresses the owner of the point, not the point: the keys of the field
    // are descriptor ids, and a graph that walked its values would point at names no
    // descriptor carries.
    expect(catalog.getProfiles({ ids: ['loyalty'] })[0]?.outgoing.contributions).toEqual([
      'checkout',
    ]);
    // Registered but not resolved through: naming `loyalty` composes `loyalty` alone,
    // while the dependency edge of the invoice provider still pulls its owner in.
    expect(catalog.resolveSelection({ selected: ['loyalty'] }).getResolved()).toEqual(['loyalty']);
    expect(
      catalog.resolveSelection({ selected: ['payment-provider-invoice'] }).getResolved(),
    ).toEqual(['checkout', 'payment-provider-invoice']);
  });
});

describe('resolveVersionedContributions', () => {
  const ownerV1: Descriptor = {
    id: 'owner',
    version: '1.0.0',
    contributionPoints: ['legacy'],
  };
  const ownerV2: Descriptor = {
    id: 'owner',
    version: '2.0.0',
    contributionPoints: ['current'],
  };
  const guestV2: Descriptor = {
    id: 'guest',
    version: '2.0.0',
    dependencies: { owner: '^2.0.0' },
    contributesTo: { owner: 'current' },
  };

  it('validates and projects exact owner versions independent of discovery order', () => {
    for (const catalog of [
      [ownerV1, ownerV2, guestV2],
      [guestV2, ownerV2, ownerV1],
    ]) {
      const relations = resolveVersionedContributions(catalog);
      expect(relations.edges).toEqual([
        {
          from: 'guest',
          fromVersion: '2.0.0',
          point: 'current',
          to: 'owner',
          toVersion: '2.0.0',
        },
      ]);
      expect(relations.project([ownerV2, guestV2]).edges).toEqual([
        { from: 'guest', point: 'current', to: 'owner' },
      ]);
    }
  });

  it('uses code-unit ordering independent of the process locale', () => {
    const zGuest = { ...guestV2, id: 'z-guest' };
    const umlautGuest = { ...guestV2, id: 'ä-guest' };

    expect(
      resolveVersionedContributions([ownerV2, umlautGuest, zGuest]).edges.map((edge) => edge.from),
    ).toEqual(['z-guest', 'ä-guest']);
  });

  it('produces the same code-unit order for every discovery permutation', () => {
    const ids = ['a-guest', 'm-guest', 'z-guest'];
    const permutations = [
      ids,
      ['a-guest', 'z-guest', 'm-guest'],
      ['m-guest', 'a-guest', 'z-guest'],
      ['m-guest', 'z-guest', 'a-guest'],
      ['z-guest', 'a-guest', 'm-guest'],
      ['z-guest', 'm-guest', 'a-guest'],
    ];

    for (const permutation of permutations) {
      const guests = permutation.map((id) => ({ ...guestV2, id }));
      expect(
        resolveVersionedContributions([ownerV2, ...guests]).edges.map((edge) => edge.from),
      ).toEqual(ids);
    }
  });

  it('orders every versioned edge field deterministically', () => {
    const owners = [
      descriptor('a-owner', { contributionPoints: ['a-point', 'z-point'] }),
      descriptor('z-owner', { contributionPoints: ['a-point'] }),
      descriptor('z-owner', { version: '2.0.0', contributionPoints: ['a-point'] }),
      descriptor('z-owner', { version: '10.0.0', contributionPoints: ['a-point'] }),
    ];
    const guests = [
      descriptor('guest', {
        contributesTo: { 'z-owner': 'a-point', 'a-owner': ['z-point', 'a-point'] },
      }),
      descriptor('guest', {
        version: '2.0.0',
        contributesTo: { 'a-owner': 'a-point' },
      }),
    ];

    expect(resolveVersionedContributions([...guests.reverse(), ...owners.reverse()]).edges).toEqual(
      [
        {
          from: 'guest',
          fromVersion: '1.0.0',
          point: 'a-point',
          to: 'a-owner',
          toVersion: '1.0.0',
        },
        {
          from: 'guest',
          fromVersion: '1.0.0',
          point: 'z-point',
          to: 'a-owner',
          toVersion: '1.0.0',
        },
        {
          from: 'guest',
          fromVersion: '1.0.0',
          point: 'a-point',
          to: 'z-owner',
          toVersion: '1.0.0',
        },
        {
          from: 'guest',
          fromVersion: '1.0.0',
          point: 'a-point',
          to: 'z-owner',
          toVersion: '2.0.0',
        },
        {
          from: 'guest',
          fromVersion: '1.0.0',
          point: 'a-point',
          to: 'z-owner',
          toVersion: '10.0.0',
        },
        {
          from: 'guest',
          fromVersion: '2.0.0',
          point: 'a-point',
          to: 'a-owner',
          toVersion: '1.0.0',
        },
      ],
    );
  });

  it('applies npm SemVer prerelease range semantics to owner candidates', () => {
    const betaOwner: Descriptor = {
      id: 'owner',
      version: '2.0.0-beta.2',
      contributionPoints: ['current'],
    };
    const betaGuest: Descriptor = {
      ...guestV2,
      version: '2.0.0-beta.3',
      dependencies: { owner: '^2.0.0-beta.1' },
    };

    expect(resolveVersionedContributions([betaOwner, betaGuest]).edges).toMatchObject([
      { fromVersion: '2.0.0-beta.3', toVersion: '2.0.0-beta.2' },
    ]);
    expect(() =>
      resolveVersionedContributions([
        betaOwner,
        { ...betaGuest, dependencies: { owner: '^2.0.0' } },
      ]),
    ).toThrow(/no owner version satisfies "\^2\.0\.0"/);
  });

  it('leaves a contribution inactive when its known owner is not selected', () => {
    const relations = resolveVersionedContributions([ownerV1, ownerV2, guestV2]);

    expect(relations.project([guestV2]).edges).toEqual([]);
    expect(relations.project([guestV2]).fills('guest')).toEqual([]);
  });

  it('does not let one owner version validate another owner version vocabulary', () => {
    const unconstrainedGuest: Descriptor = {
      id: guestV2.id,
      version: guestV2.version,
      contributesTo: { owner: 'current' },
    };

    expect(() => resolveVersionedContributions([ownerV1, ownerV2, unconstrainedGuest])).toThrow(
      /guest@2\.0\.0.*current.*owner@1\.0\.0/s,
    );
  });

  it('rejects duplicate version identities instead of choosing one by order', () => {
    expect(() => resolveVersionedContributions([ownerV1, { ...ownerV1 }])).toThrow(
      /Duplicate descriptor identity "owner@1\.0\.0"/,
    );
  });

  it.each([
    {
      guest: { ...guestV2, contributesTo: null },
      message: /must map an owning descriptor/,
    },
    {
      guest: { ...guestV2, contributesTo: ['owner'] },
      message: /must map an owning descriptor/,
    },
    {
      guest: { ...guestV2, contributesTo: 'owner' },
      message: /must map an owning descriptor/,
    },
    {
      guest: { ...guestV2, contributesTo: 42 },
      message: /must map an owning descriptor/,
    },
    {
      guest: { ...guestV2, contributesTo: { owner: [] } },
      message: /must name one contribution point/,
    },
    {
      guest: { ...guestV2, contributesTo: { owner: [42] } },
      message: /must name one contribution point/,
    },
    {
      guest: { ...guestV2, contributesTo: { owner: [''] } },
      message: /must name one contribution point/,
    },
    {
      guest: { ...guestV2, contributesTo: { owner: ['current', 42] } },
      message: /must name one contribution point/,
    },
    {
      guest: { ...guestV2, contributesTo: { owner: [{ length: 1 }] } },
      message: /must name one contribution point/,
    },
    {
      guest: { ...guestV2, contributesTo: { guest: 'current' } },
      message: /contribution to itself/,
    },
    {
      guest: { ...guestV2, contributesTo: { missing: 'current' } },
      message: /not a known descriptor of this catalog/,
    },
    {
      guest: { ...guestV2, dependencies: { owner: 'banana' } },
      message: /invalid dependency range "banana"/,
    },
    {
      guest: { ...guestV2, dependencies: { owner: '^3.0.0' } },
      message: /no owner version satisfies "\^3\.0\.0"/,
    },
  ] as Array<{ guest: Descriptor; message: RegExp }>)(
    'rejects malformed versioned declaration %#',
    ({ guest, message }) => {
      expect(() => resolveVersionedContributions([ownerV1, ownerV2, guest])).toThrow(message);
    },
  );

  it.each(['v1.0.0', ' 1.0.0', ''])('rejects invalid descriptor version %j', (version) => {
    expect(() => resolveVersionedContributions([{ ...ownerV1, version }])).toThrow(
      /has invalid version/,
    );
  });

  it('rejects a non-string descriptor version from an untyped caller', () => {
    expect(() =>
      resolveVersionedContributions([{ ...ownerV1, version: 1 } as unknown as Descriptor]),
    ).toThrow(/has invalid version 1/);
  });

  it('rejects a non-string owner dependency range from an untyped caller', () => {
    const untyped = {
      ...guestV2,
      dependencies: { owner: 2 },
    } as unknown as Descriptor;

    expect(() => resolveVersionedContributions([ownerV2, untyped])).toThrow(
      /invalid dependency range 2/,
    );
  });

  it('reports an owner version that declares no contribution points', () => {
    expect(() =>
      resolveVersionedContributions([descriptor('owner', { version: '2.0.0' }), guestV2]),
    ).toThrow(/declares no contribution point/);
  });

  it('names the available contribution points in an incompatible declaration', () => {
    expect(() =>
      resolveVersionedContributions([
        { ...ownerV1, contributionPoints: ['legacy', 'fallback'] },
        { ...guestV2, dependencies: {} },
      ]),
    ).toThrow(/which declares "legacy", "fallback"/);
  });

  it('answers points and both directions for the selected version', () => {
    const catalog = resolveVersionedContributions([ownerV1, ownerV2, guestV2]);
    const projected = catalog.project([ownerV2, guestV2]);

    expect(catalog.points(ownerV1)).toEqual(['legacy']);
    expect(catalog.points({ id: 'missing', version: '1.0.0' })).toEqual([]);
    expect(projected.points('owner')).toEqual(['current']);
    expect(projected.fills('guest')).toEqual([{ from: 'guest', point: 'current', to: 'owner' }]);
    expect(projected.receives('owner')).toEqual([{ from: 'guest', point: 'current', to: 'owner' }]);
    expect(projected.points('missing')).toEqual([]);
    expect(projected.receives('missing')).toEqual([]);
  });

  it('rejects a projection from outside the catalog or with two selected versions', () => {
    const relations = resolveVersionedContributions([ownerV1, ownerV2, guestV2]);

    expect(() => relations.project([{ id: 'missing', version: '1.0.0' }])).toThrow(
      /selected unknown descriptor "missing@1\.0\.0"/,
    );
    expect(() => relations.project([ownerV1, ownerV2])).toThrow(
      /selected multiple versions of "owner": 1\.0\.0, 2\.0\.0/,
    );
    expect(relations.project([ownerV2, ownerV2]).points('owner')).toEqual(['current']);
  });
});
