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
    expect(catalog.getProfiles({ ids: ['loyalty'] })[0]?.outgoing[relation.id]).toEqual([
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
