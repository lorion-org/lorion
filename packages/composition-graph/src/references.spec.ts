import { describe, expect, it } from 'vitest';

import {
  assertKnownReferences,
  contributionRelationDescriptor,
  createDescriptorCatalog,
  type Descriptor,
} from './index';

function descriptor(id: string, overrides: Partial<Descriptor> = {}): Descriptor {
  return { id, version: '1.0.0', ...overrides };
}

const checkout = descriptor('checkout', { contributionPoints: ['payment-method'] });
const payments = descriptor('payments');

describe('assertKnownReferences', () => {
  it('passes when every named target is declared', () => {
    const shop = descriptor('shop-coffee', { dependencies: { checkout: '^1.0.0' } });

    expect(() => assertKnownReferences({ descriptors: [checkout, payments, shop] })).not.toThrow();
  });

  it('names the declaring descriptor, the target and the relation', () => {
    const shop = descriptor('shop-coffee', { dependencies: { chekout: '^1.0.0' } });

    expect(() => assertKnownReferences({ descriptors: [checkout, shop] })).toThrow(
      '"shop-coffee" names "chekout" under "dependencies"',
    );
  });

  it('checks the relations a host registers, not only the default ones', () => {
    const guest = descriptor('loyalty', { contributesTo: { chekout: 'payment-method' } });
    const relationDescriptors = [
      ...createDescriptorCatalog({ descriptors: [] }).getRelationDescriptors(),
      contributionRelationDescriptor(),
    ];

    expect(() => assertKnownReferences({ descriptors: [checkout, guest] })).not.toThrow();
    expect(() =>
      assertKnownReferences({ descriptors: [checkout, guest], relationDescriptors }),
    ).toThrow('"loyalty" names "chekout" under "contributions"');
  });

  it('reports every unknown name at once, in a stable order', () => {
    const shop = descriptor('shop-coffee', {
      dependencies: { chekout: '^1.0.0', paymets: '^1.0.0' },
    });

    expect(() => assertKnownReferences({ descriptors: [shop] })).toThrow(
      'Descriptors name targets that no descriptor of this composition declares: "shop-coffee" names "chekout" under "dependencies"; "shop-coffee" names "paymets" under "dependencies".',
    );
  });

  it('reports one declaration once, however often it is read', () => {
    const grouping = descriptor('base', { dependencies: { absent: '^1.0.0' } });

    expect(() => assertKnownReferences({ descriptors: [grouping, grouping] })).toThrow(
      'declares: "base" names "absent" under "dependencies".',
    );
  });

  it('accepts a declared target that this composition does not resolve', () => {
    const admin = descriptor('admin', { dependencies: { payments: '^1.0.0' } });
    const catalog = createDescriptorCatalog({ descriptors: [checkout, payments, admin] });

    expect(() => assertKnownReferences({ descriptors: [checkout, payments, admin] })).not.toThrow();
    expect(catalog.resolveSelection({ selected: ['checkout'] }).getResolved()).toEqual([
      'checkout',
    ]);
  });
});
