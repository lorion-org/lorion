import { describe, expect, it } from 'vitest';

import {
  contributionRelationDescriptor,
  createDescriptorCatalog,
  resolveContributions,
  type Descriptor,
} from './index';

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
