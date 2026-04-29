import { describe, expect, it } from 'vitest';

import {
  buildDescriptorGraph,
  buildDescriptorMap,
  createDescriptorCatalog,
  defaultRelationDescriptors,
  explainPath,
  explainPathsBatch,
  getCompositionProvenance,
  getDependents,
  getTransitiveTargets,
  parseDescriptorIds,
  type Descriptor,
  type RelationDescriptor,
} from './index';

function createDescriptor(id: string, overrides: Partial<Descriptor> = {}): Descriptor {
  return {
    id,
    version: '1.0.0',
    location: `./descriptors/${id}`,
    dependencies: {},
    ...overrides,
  };
}

function createRelationDescriptor(
  overrides: Partial<RelationDescriptor> & Pick<RelationDescriptor, 'id'>,
): RelationDescriptor {
  return {
    ...overrides,
  };
}

describe('buildDescriptorMap', () => {
  it('collects flat descriptors into one map', () => {
    const descriptorMap = buildDescriptorMap([
      createDescriptor('billing'),
      createDescriptor('dashboard'),
      createDescriptor('web-shell'),
    ]);

    expect(Array.from(descriptorMap.keys())).toEqual(['billing', 'dashboard', 'web-shell']);
  });
});

describe('parseDescriptorIds', () => {
  it('parses arrays and strings into deterministic unique ids', () => {
    expect(parseDescriptorIds(['billing', 'billing', 'storage'])).toEqual(['billing', 'storage']);
    expect(parseDescriptorIds('billing  storage,billing')).toEqual(['billing', 'storage']);
  });
});

describe('buildDescriptorGraph', () => {
  it('only reads dependencies by default', () => {
    const descriptorMap = buildDescriptorMap([
      createDescriptor('billing', {
        dependencies: { storage: '*' },
        recommends: { analytics: '*' },
      }),
      createDescriptor('analytics'),
      createDescriptor('storage'),
    ]);

    const graph = buildDescriptorGraph({ descriptorMap });

    expect(graph.edges).toEqual([
      {
        from: 'billing',
        to: 'storage',
        relation: 'dependencies',
        source: 'descriptor',
      },
    ]);
  });

  it('reads configured relation fields and ignores everything else', () => {
    const descriptorMap = buildDescriptorMap([
      createDescriptor('billing', {
        dependencies: { storage: '*' },
        recommends: { analytics: '*' },
        extendsBilling: { audit: '*' },
      }),
      createDescriptor('analytics'),
      createDescriptor('audit'),
      createDescriptor('storage'),
    ]);

    const graph = buildDescriptorGraph({
      descriptorMap,
      relationDescriptors: [
        ...defaultRelationDescriptors,
        createRelationDescriptor({
          id: 'recommends',
          field: 'recommends',
        }),
      ],
    });

    expect(graph.edges).toEqual([
      {
        from: 'billing',
        to: 'analytics',
        relation: 'recommends',
        source: 'descriptor',
      },
      {
        from: 'billing',
        to: 'storage',
        relation: 'dependencies',
        source: 'descriptor',
      },
    ]);
  });

  it('supports relation ids as fallback fields and skips invalid targets', () => {
    const descriptorMap = buildDescriptorMap([
      createDescriptor('billing', {
        dependencies: { storage: '*' },
        linkedFrom: { router: '*', missing: '*' },
        linkedWith: ['not-a-map'],
      }),
      createDescriptor('router'),
      createDescriptor('storage'),
    ]);

    const graph = buildDescriptorGraph({
      descriptorMap,
      relationDescriptors: [
        ...defaultRelationDescriptors,
        createRelationDescriptor({
          id: 'linkedFrom',
        }),
        createRelationDescriptor({
          id: 'linkedWith',
        }),
      ],
    });

    expect(graph.edges).toEqual([
      {
        from: 'billing',
        to: 'router',
        relation: 'linkedFrom',
        source: 'descriptor',
      },
      {
        from: 'billing',
        to: 'storage',
        relation: 'dependencies',
        source: 'descriptor',
      },
    ]);
  });
});

describe('graph helpers', () => {
  it('walks transitive targets, explains paths, and reports dependents deterministically', () => {
    const graph = buildDescriptorGraph({
      descriptorMap: buildDescriptorMap([
        createDescriptor('billing', {
          dependencies: { storage: '*' },
        }),
        createDescriptor('storage', {
          dependencies: { queue: '*' },
        }),
        createDescriptor('queue'),
        createDescriptor('ui-shell', {
          dependencies: { billing: '*' },
        }),
      ]),
    });

    expect(
      getTransitiveTargets({
        graph,
        start: ['ui-shell', 'missing'],
        relationIds: ['dependencies'],
      }),
    ).toEqual(['billing', 'queue', 'storage', 'ui-shell']);

    expect(
      getDependents({
        graph,
        target: 'queue',
        relationIds: ['dependencies'],
        transitive: false,
      }),
    ).toEqual(['storage']);
    expect(
      getDependents({
        graph,
        target: 'queue',
        relationIds: ['dependencies'],
        transitive: true,
      }),
    ).toEqual(['billing', 'storage', 'ui-shell']);
    expect(
      getDependents({
        graph,
        target: 'missing',
        relationIds: ['dependencies'],
      }),
    ).toEqual([]);

    expect(
      explainPath({
        graph,
        from: 'ui-shell',
        to: 'queue',
        relationIds: ['dependencies'],
      }),
    ).toEqual([
      {
        from: 'ui-shell',
        to: 'billing',
        relation: 'dependencies',
      },
      {
        from: 'billing',
        to: 'storage',
        relation: 'dependencies',
      },
      {
        from: 'storage',
        to: 'queue',
        relation: 'dependencies',
      },
    ]);
    expect(
      explainPath({
        graph,
        from: 'queue',
        to: 'queue',
        relationIds: ['dependencies'],
      }),
    ).toEqual([]);
    expect(
      explainPath({
        graph,
        from: 'missing',
        to: 'queue',
        relationIds: ['dependencies'],
      }),
    ).toEqual([]);
    expect(
      explainPathsBatch({
        graph,
        pairs: [
          { from: 'storage', to: 'queue' },
          { from: 'ui-shell', to: 'queue' },
          { from: 'queue', to: 'ui-shell' },
        ],
        relationIds: ['dependencies'],
      }),
    ).toEqual([
      {
        from: 'queue',
        to: 'ui-shell',
        path: [],
      },
      {
        from: 'storage',
        to: 'queue',
        path: [
          {
            from: 'storage',
            to: 'queue',
            relation: 'dependencies',
          },
        ],
      },
      {
        from: 'ui-shell',
        to: 'queue',
        path: [
          {
            from: 'ui-shell',
            to: 'billing',
            relation: 'dependencies',
          },
          {
            from: 'billing',
            to: 'storage',
            relation: 'dependencies',
          },
          {
            from: 'storage',
            to: 'queue',
            relation: 'dependencies',
          },
        ],
      },
    ]);
  });

  it('returns provenance for selected, base, and resolved descriptors', () => {
    const graph = buildDescriptorGraph({
      descriptorMap: buildDescriptorMap([
        createDescriptor('billing', {
          dependencies: { storage: '*' },
        }),
        createDescriptor('storage'),
        createDescriptor('analytics'),
      ]),
    });

    expect(
      getCompositionProvenance({
        graph,
        descriptorIds: ['billing', 'storage', 'analytics', 'missing'],
        selected: ['billing', 'billing'],
        baseDescriptors: ['storage', 'missing'],
        relationIds: ['dependencies'],
      }),
    ).toEqual([
      {
        descriptorId: 'analytics',
        origins: [],
      },
      {
        descriptorId: 'billing',
        origins: [
          {
            originType: 'selected',
            path: [],
          },
        ],
      },
      {
        descriptorId: 'storage',
        origins: [
          {
            originType: 'base',
            path: [],
          },
          {
            originType: 'resolved',
            path: [
              {
                from: 'billing',
                to: 'storage',
                relation: 'dependencies',
              },
            ],
          },
        ],
      },
    ]);
  });
});

describe('createDescriptorCatalog', () => {
  it('provides deterministic profiles and relation queries', () => {
    const catalog = createDescriptorCatalog({
      relationDescriptors: [
        createRelationDescriptor({
          id: 'recommends',
          field: 'recommends',
        }),
      ],
      descriptors: [
        createDescriptor('billing', {
          dependencies: { storage: '*' },
          recommends: { analytics: '*' },
        }),
        createDescriptor('storage'),
        createDescriptor('analytics'),
        createDescriptor('disabled-entry', {
          disabled: true,
        }),
      ],
    });

    expect(catalog.getRelationDescriptors().map((descriptor) => descriptor.id)).toEqual([
      'dependencies',
      'recommends',
    ]);
    expect(catalog.getProfiles().map((entry) => entry.id)).not.toContain('disabled-entry');
    expect(catalog.getProfiles({ ids: ['disabled-entry'] })).toEqual([
      expect.objectContaining({
        id: 'disabled-entry',
        disabled: true,
      }),
    ]);
    expect(catalog.getIncomingRelationMap('dependencies')).toEqual(
      new Map([['storage', ['billing']]]),
    );
    expect(
      catalog.explain({
        from: 'billing',
        to: 'storage',
        relationIds: ['dependencies'],
      }),
    ).toEqual([
      {
        from: 'billing',
        to: 'storage',
        relation: 'dependencies',
      },
    ]);
  });
});

describe('resolveSelection', () => {
  it('resolves selected and base descriptors with configured recommendations', () => {
    const catalog = createDescriptorCatalog({
      relationDescriptors: [
        createRelationDescriptor({
          id: 'extensions',
          field: 'extensions',
        }),
        createRelationDescriptor({
          id: 'integrations',
          field: 'integrations',
        }),
      ],
      descriptors: [
        createDescriptor('billing', {
          dependencies: { storage: '*' },
          integrations: { analytics: '*' },
        }),
        createDescriptor('storage'),
        createDescriptor('analytics'),
        createDescriptor('audit-extension', {
          extensions: { billing: '*' },
        }),
        createDescriptor('web-shell', {
          dependencies: { router: '*' },
        }),
        createDescriptor('router'),
      ],
    });

    const selection = catalog.resolveSelection({
      selected: ['billing'],
      baseDescriptors: ['web-shell'],
      policy: {
        inspectionRelationIds: ['dependencies', 'extensions', 'integrations'],
      },
    });

    expect(selection.getSelected()).toEqual(['billing']);
    expect(selection.getBaseDescriptors()).toEqual(['web-shell']);
    expect(selection.getResolved()).toEqual(['billing', 'router', 'storage', 'web-shell']);
    expect(selection.getResolvedDescriptors().map((descriptor) => descriptor.id)).toEqual([
      'billing',
      'router',
      'storage',
      'web-shell',
    ]);
    expect(selection.getProvenance()).toEqual([
      {
        descriptorId: 'billing',
        origins: [
          {
            originType: 'selected',
            path: [],
          },
        ],
      },
      {
        descriptorId: 'router',
        origins: [
          {
            originType: 'resolved',
            path: [
              {
                from: 'web-shell',
                to: 'router',
                relation: 'dependencies',
              },
            ],
          },
        ],
      },
      {
        descriptorId: 'storage',
        origins: [
          {
            originType: 'resolved',
            path: [
              {
                from: 'billing',
                to: 'storage',
                relation: 'dependencies',
              },
            ],
          },
        ],
      },
      {
        descriptorId: 'web-shell',
        origins: [
          {
            originType: 'base',
            path: [],
          },
        ],
      },
    ]);
  });

  it('supports explain and dependent queries from the resolved graph', () => {
    const catalog = createDescriptorCatalog({
      descriptors: [
        createDescriptor('billing', {
          dependencies: { storage: '*' },
        }),
        createDescriptor('storage', {
          dependencies: { queue: '*' },
        }),
        createDescriptor('queue'),
        createDescriptor('web-shell', {
          dependencies: { billing: '*' },
        }),
      ],
    });

    const selection = catalog.resolveSelection({
      selected: ['billing'],
      baseDescriptors: ['web-shell'],
    });

    expect(selection.getBaseDescriptors()).toEqual(['web-shell']);
    expect(selection.getDependentsFor('queue', { transitive: false })).toEqual(['storage']);
    expect(selection.getDependentsFor('queue', { transitive: true })).toEqual([
      'billing',
      'storage',
      'web-shell',
    ]);
    expect(
      selection.explain({
        from: 'web-shell',
        to: 'queue',
      }),
    ).toEqual([
      {
        from: 'web-shell',
        to: 'billing',
        relation: 'dependencies',
      },
      {
        from: 'billing',
        to: 'storage',
        relation: 'dependencies',
      },
      {
        from: 'storage',
        to: 'queue',
        relation: 'dependencies',
      },
    ]);
  });

  it('uses default policy branches and caches derived views', () => {
    const catalog = createDescriptorCatalog({
      descriptors: [
        createDescriptor('billing', {
          dependencies: { storage: '*' },
        }),
        createDescriptor('storage'),
        createDescriptor('ui-shell', {
          dependencies: { billing: '*' },
        }),
      ],
    });

    const selection = catalog.resolveSelection({
      selected: ['billing', '', 'billing'],
      baseDescriptors: ['ui-shell', '', 'ui-shell'],
    });

    const firstResolvedDescriptors = selection.getResolvedDescriptors();
    const secondResolvedDescriptors = selection.getResolvedDescriptors();
    const firstProvenance = selection.getProvenance();
    const secondProvenance = selection.getProvenance();

    expect(selection.getSelected()).toEqual(['billing']);
    expect(selection.getBaseDescriptors()).toEqual(['ui-shell']);
    expect(firstResolvedDescriptors).toBe(secondResolvedDescriptors);
    expect(firstProvenance).toBe(secondProvenance);
    expect(
      selection.explain({
        from: 'ui-shell',
        to: 'storage',
      }),
    ).toEqual([
      {
        from: 'ui-shell',
        to: 'billing',
        relation: 'dependencies',
      },
      {
        from: 'billing',
        to: 'storage',
        relation: 'dependencies',
      },
    ]);
    expect(
      selection.explainPathsBatch({
        pairs: [{ from: 'ui-shell', to: 'storage' }],
      }),
    ).toEqual([
      {
        from: 'ui-shell',
        to: 'storage',
        path: [
          {
            from: 'ui-shell',
            to: 'billing',
            relation: 'dependencies',
          },
          {
            from: 'billing',
            to: 'storage',
            relation: 'dependencies',
          },
        ],
      },
    ]);
  });

  it('honors descriptorMap input and custom profile fields', () => {
    const descriptorMap = buildDescriptorMap([
      createDescriptor('billing', {
        capabilities: ['write', 'read'],
        providesFor: 'backoffice',
        location: '/tmp/billing',
      }),
      createDescriptor('storage', {
        disabled: true,
      }),
    ]);
    const catalog = createDescriptorCatalog({
      descriptorMap,
    });

    expect(catalog.getAllDescriptors().map((descriptor) => descriptor.id)).toEqual([
      'billing',
      'storage',
    ]);
    expect(catalog.getDescriptor('billing')).toEqual(
      expect.objectContaining({
        id: 'billing',
      }),
    );
    expect(catalog.getProfiles({ includeDisabled: true })).toEqual([
      expect.objectContaining({
        id: 'billing',
        capabilities: ['read', 'write'],
        providesFor: 'backoffice',
        location: '/tmp/billing',
      }),
      expect.objectContaining({
        id: 'storage',
        disabled: true,
      }),
    ]);
  });

  it('fails fast for unknown selected and base descriptors', () => {
    const catalog = createDescriptorCatalog({
      descriptors: [createDescriptor('billing')],
    });

    expect(() =>
      catalog.resolveSelection({
        selected: ['missing'],
      }),
    ).toThrow('Unknown selected descriptors: missing');

    expect(() =>
      catalog.resolveSelection({
        baseDescriptors: ['missing'],
      }),
    ).toThrow('Unknown base descriptors: missing');
  });
});
