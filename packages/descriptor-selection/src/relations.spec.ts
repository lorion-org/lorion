import { describe, expect, it } from 'vitest';

import type { Descriptor, RelationDescriptor } from '@lorion-org/composition-graph';
import { resolveRequestedSelection, selectDescriptorsWithProviders } from './index';

function descriptor(id: string, overrides: Partial<Descriptor> = {}): Descriptor {
  return { id, version: '1.0.0', ...overrides };
}

// A shop that asks for a theme through a relation of the host's own, over a graph
// that also resolves a provider slot the ordinary way.
const descriptors = [
  descriptor('shop-coffee', { dependencies: { checkout: '^1.0.0' }, themedBy: 'theme-classic' }),
  descriptor('checkout', { dependencies: { payments: '^1.0.0' } }),
  descriptor('payments'),
  descriptor('theme-classic'),
  descriptor('payment-provider-stripe', {
    providesFor: 'payments',
    defaultFor: 'payments',
  }),
];

const themeRelation: RelationDescriptor = {
  id: 'themes',
  field: 'themedBy',
  roles: ['resolution', 'provenance', 'inspection'],
};

function resolve(input: {
  relationDescriptors?: readonly RelationDescriptor[];
  policy?: Parameters<typeof selectDescriptorsWithProviders>[0]['policy'];
}): string[] {
  const { items } = selectDescriptorsWithProviders({
    items: descriptors,
    getDescriptor: (item) => item,
    withDescriptor: (_item, next) => next,
    seed: { selected: ['shop-coffee'], selectionSeed: false },
    ...(input.relationDescriptors ? { relationDescriptors: input.relationDescriptors } : {}),
    ...(input.policy ? { policy: input.policy } : {}),
  });
  return items.map((item) => item.id);
}

describe('host relations in a provider-aware selection', () => {
  it('resolves through a registered relation and keeps the provider slot filled', () => {
    expect(resolve({ relationDescriptors: [themeRelation] })).toEqual([
      'checkout',
      'payment-provider-stripe',
      'payments',
      'shop-coffee',
      'theme-classic',
    ]);
  });

  it('leaves an unregistered relation unwalked', () => {
    expect(resolve({})).toEqual(['checkout', 'payment-provider-stripe', 'payments', 'shop-coffee']);
  });

  it('keeps the provider relations a hand-written policy would have replaced', () => {
    // The policy names one list, which replaces it. The provider relation this package
    // resolves through is added back from the relation it registers, so the default
    // provider still wins its slot.
    expect(resolve({ policy: { resolutionRelationIds: ['dependencies'] } })).toContain(
      'payment-provider-stripe',
    );
  });
});

describe('what a run named', () => {
  it('is the explicit list when one is given', () => {
    expect(resolveRequestedSelection({ selected: ['shop-coffee'], selectionSeed: false })).toEqual([
      'shop-coffee',
    ]);
  });

  it('is the seed a run passed on its command line or environment', () => {
    expect(
      resolveRequestedSelection({
        defaultSelection: ['storefront'],
        selectionSeed: { argv: ['--features=admin'], env: {}, cliKeys: ['features'] },
      }),
    ).toEqual(['admin']);
  });

  it('is nothing when the run only takes what its host defaults to', () => {
    expect(
      resolveRequestedSelection({
        defaultSelection: ['storefront'],
        selectionSeed: { argv: [], env: {}, cliKeys: ['features'] },
      }),
    ).toBeNull();
    expect(
      resolveRequestedSelection({ defaultSelection: ['storefront'], selectionSeed: false }),
    ).toBeNull();
  });
});
