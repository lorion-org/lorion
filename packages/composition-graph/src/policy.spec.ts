import { describe, expect, it } from 'vitest';

import {
  createDescriptorCatalog,
  defaultCompositionPolicy,
  extendCompositionPolicy,
  type Descriptor,
  type RelationDescriptor,
} from './index';

function descriptor(id: string, overrides: Partial<Descriptor> = {}): Descriptor {
  return { id, version: '1.0.0', ...overrides };
}

// A host relation next to the dependency edge: a theme a descriptor asks to have
// mounted with it, resolved alongside the dependencies it declares.
const themeRelation: RelationDescriptor = {
  id: 'themes',
  field: 'themedBy',
  roles: ['resolution', 'provenance', 'inspection'],
};
const inspectionRelation: RelationDescriptor = {
  id: 'contributions',
  field: 'contributesTo',
  targetMode: 'keys',
  roles: ['inspection'],
};

const descriptors = [
  descriptor('shop-coffee', { dependencies: { checkout: '^1.0.0' }, themedBy: 'theme-classic' }),
  descriptor('checkout'),
  descriptor('theme-classic'),
];

describe('extendCompositionPolicy', () => {
  it('adds a relation in the roles it declares and keeps the lists it does not name', () => {
    const policy = extendCompositionPolicy(undefined, [inspectionRelation]);

    expect(policy.inspectionRelationIds).toEqual([
      ...defaultCompositionPolicy.inspectionRelationIds,
      'contributions',
    ]);
    // A list no role names stays unstated, so the composition keeps resolving through
    // whatever the caller downstream defaults it to.
    expect(policy.resolutionRelationIds).toBeUndefined();
    expect(policy.provenanceRelationIds).toBeUndefined();
  });

  it('extends the lists a caller already named instead of replacing them', () => {
    const policy = extendCompositionPolicy(
      { resolutionRelationIds: ['dependencies', 'defaultProviders'] },
      [themeRelation],
    );

    expect(policy.resolutionRelationIds).toEqual(['dependencies', 'defaultProviders', 'themes']);
  });

  it('registers a relation without roles for reading only', () => {
    const policy = extendCompositionPolicy(undefined, [{ id: 'themes', field: 'themedBy' }]);

    expect(policy).toEqual({});
  });

  it('resolves through a relation the host registers for resolution', () => {
    const catalog = createDescriptorCatalog({
      descriptors,
      relationDescriptors: [themeRelation],
    });

    // Without the policy the edge is readable and nothing walks it.
    expect(catalog.resolveSelection({ selected: ['shop-coffee'] }).getResolved()).toEqual([
      'checkout',
      'shop-coffee',
    ]);
    expect(
      catalog
        .resolveSelection({
          selected: ['shop-coffee'],
          policy: extendCompositionPolicy(undefined, [themeRelation]),
        })
        .getResolved(),
    ).toEqual(['checkout', 'shop-coffee', 'theme-classic']);
  });

  it('keeps the dependency edge that a hand-written policy would have dropped', () => {
    const catalog = createDescriptorCatalog({
      descriptors,
      relationDescriptors: [themeRelation],
    });

    // Naming one list replaces it: the composition then walks the theme edge alone
    // and the dependency of the shop is gone.
    expect(
      catalog
        .resolveSelection({
          selected: ['shop-coffee'],
          policy: { resolutionRelationIds: ['themes'] },
        })
        .getResolved(),
    ).toEqual(['shop-coffee', 'theme-classic']);
    expect(
      catalog
        .resolveSelection({
          selected: ['shop-coffee'],
          policy: extendCompositionPolicy(undefined, [themeRelation]),
        })
        .getResolved(),
    ).toContain('checkout');
  });
});
