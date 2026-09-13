import { describe, expect, it } from 'vitest';

import type { Descriptor } from '@lorion-org/composition-graph';

import {
  assertKnownProviderCapabilities,
  assertSingleDefaultProvider,
  assertSingleSelectedProvider,
  resolveDescriptorSelection,
  selectDescriptors,
  selectDescriptorsWithProviders,
} from './index';

function reference(): Descriptor[] {
  return [
    { id: 'platform', version: '1.0.0', dependencies: { tokens: '^1.0.0' } },
    { id: 'tokens', version: '1.0.0' },
    { id: 'auth', version: '1.0.0' },
    { id: 'auth-session', version: '1.0.0', providesFor: 'auth', defaultFor: 'auth' },
    { id: 'auth-oidc', version: '1.0.0', providesFor: 'auth' },
    { id: 'dashboard', version: '1.0.0' },
    { id: 'reports', version: '1.0.0' },
  ];
}

function select(
  items: Descriptor[],
  seed: Parameters<typeof selectDescriptors>[0]['seed'],
): string[] {
  return selectDescriptors({
    items,
    getDescriptor: (descriptor) => descriptor,
    withDescriptor: (_item, descriptor) => descriptor,
    seed,
  })
    .map((descriptor) => descriptor.id)
    .sort();
}

describe('resolveDescriptorSelection', () => {
  it('prefers explicit selected over everything', () => {
    expect(
      resolveDescriptorSelection({
        selected: ['a'],
        defaultSelection: ['b'],
        selectionSeed: { env: { X: 'c' }, envKeys: ['X'], argv: [] },
      }),
    ).toEqual(['a']);
  });

  it('uses defaultSelection when selectionSeed is disabled', () => {
    expect(resolveDescriptorSelection({ selectionSeed: false, defaultSelection: ['b'] })).toEqual([
      'b',
    ]);
  });

  it('parses a CLI argv seed', () => {
    expect(
      resolveDescriptorSelection({
        selectionSeed: { argv: ['--features', 'reports'], env: {}, cliKeys: ['--features'] },
      }),
    ).toEqual(['reports']);
  });

  it('reads an injected env seed, falling back to defaultSelection', () => {
    expect(
      resolveDescriptorSelection({
        defaultSelection: ['b'],
        selectionSeed: { argv: [], env: { X: 'c' }, envKeys: ['X'] },
      }),
    ).toEqual(['c']);
    expect(
      resolveDescriptorSelection({
        defaultSelection: ['b'],
        selectionSeed: { argv: [], env: {}, envKeys: ['X'] },
      }),
    ).toEqual(['b']);
  });
});

describe('selectDescriptors', () => {
  describe('callback-only grouping membership', () => {
    const items: Descriptor[] = [
      { id: 'app', version: '1.0.0', dependencies: { group: '*' } },
      { id: 'group', version: '1.0.0' },
      { id: 'nested', version: '1.0.0' },
      { id: 'feature', version: '1.0.0' },
      { id: 'auth', version: '1.0.0' },
      { id: 'session', version: '1.0.0', providesFor: 'auth' },
      { id: 'oidc', version: '1.0.0', providesFor: 'auth' },
      { id: 'losing-member', version: '1.0.0' },
      { id: 'inactive', version: '1.0.0' },
    ];
    const selectGroups = (groups: Record<string, string[]>, selected = ['app']) =>
      selectDescriptorsWithProviders({
        items,
        getDescriptor: (item) => item,
        withDescriptor: (_, item) => item,
        getSelectionGroupMembers: (item) => groups[item.id],
        seed: { selected, selectionSeed: false },
      });

    it('activates nested indirect members, terminates cycles and ignores inactive groups', () => {
      const result = selectGroups({
        group: ['nested'],
        nested: ['group', 'feature'],
        inactive: ['missing'],
      });
      expect(result.items.map((item) => item.id)).toEqual(['app', 'feature', 'group', 'nested']);
    });

    it('does not request providers from inactive callback-only groups', () => {
      const result = selectGroups({ group: ['feature'], inactive: ['session'] });
      expect(result.items.map((item) => item.id)).toEqual(['app', 'feature', 'group']);
      expect(result.providerSelection.slots).toEqual([]);
    });

    it.each([
      { selected: ['app'], mode: 'dependency' },
      { selected: ['group'], mode: 'explicit' },
    ])('gives provider membership $mode precedence', ({ selected, mode }) => {
      const result = selectGroups({ group: ['session'] }, selected);
      expect(result.items.map((item) => item.id)).toContain('session');
      expect(result.providerSelection.slots).toMatchObject([
        { capabilityId: 'auth', selectedProviderId: 'session', mode },
      ]);
    });

    it('lets explicit providers override indirect members without activating their descendants', () => {
      const result = selectGroups({ group: ['session'], session: ['losing-member'] }, [
        'app',
        'oidc',
      ]);
      expect(result.items.map((item) => item.id)).toEqual(['app', 'group', 'oidc']);
      expect(result.providerSelection.slots).toMatchObject([
        { selectedProviderId: 'oidc', mode: 'explicit' },
      ]);
    });

    it('rejects conflicting indirect provider members', () => {
      expect(() => selectGroups({ group: ['session', 'nested'], nested: ['oidc'] })).toThrow(
        /provider/i,
      );
    });

    it.each([['app'], ['group']])(
      'keeps callback-only capability membership optional for %s',
      (selected) => {
        const result = selectGroups({ group: ['auth'] }, [selected]);
        expect(result.items.map((item) => item.id)).toContain('auth');
        expect(result.providerSelection.slots).toMatchObject([
          { capabilityId: 'auth', state: 'unfilled', required: false },
        ]);
      },
    );

    it.each(['ghost', 'missing'])(
      'drops transient default-provider membership %s after an indirect override',
      (member) => {
        const result = selectDescriptorsWithProviders<Descriptor>({
          items: [
            { id: 'app', version: '1.0.0', dependencies: { auth: '*', transport: '*' } },
            { id: 'auth', version: '1.0.0' },
            { id: 'transport', version: '1.0.0' },
            { id: 'session', version: '1.0.0', providesFor: 'auth', defaultFor: 'auth' },
            { id: 'oidc', version: '1.0.0', providesFor: 'auth' },
            {
              id: 'http',
              version: '1.0.0',
              providesFor: 'transport',
              defaultFor: 'transport',
              dependencies: { group: '*' },
            },
            { id: 'group', version: '1.0.0' },
            { id: 'ghost', version: '1.0.0' },
          ],
          getDescriptor: (item) => item,
          withDescriptor: (_, item) => item,
          getSelectionGroupMembers: (item) =>
            item.id === 'group' ? ['oidc'] : item.id === 'session' ? [member] : undefined,
          seed: { selected: ['app'], selectionSeed: false },
        });
        expect(result.items.map((item) => item.id)).toEqual([
          'app',
          'auth',
          'group',
          'http',
          'oidc',
          'transport',
        ]);
        expect(result.providerSelection.slots).toMatchObject([
          { capabilityId: 'auth', selectedProviderId: 'oidc', mode: 'dependency' },
          { capabilityId: 'transport', selectedProviderId: 'http', mode: 'default' },
        ]);
      },
    );

    it('rejects an unknown member when its indirect grouping participates', () => {
      expect(() => selectGroups({ group: ['missing'] })).toThrow(/missing/);
    });
  });

  it('gives providers named through a directly selected grouping explicit precedence', () => {
    type Item = { descriptor: Descriptor; grouping?: boolean };
    const items: Item[] = [
      { descriptor: { id: 'auth', version: '1.0.0' } },
      { descriptor: { id: 'auth-session', version: '1.0.0', providesFor: 'auth' } },
      { descriptor: { id: 'auth-anonymous', version: '1.0.0', providesFor: 'auth' } },
      {
        descriptor: {
          id: 'application',
          version: '1.0.0',
          dependencies: { 'auth-session': '^1.0.0' },
        },
      },
      {
        grouping: true,
        descriptor: {
          id: 'anonymous-profile',
          version: '1.0.0',
          dependencies: { 'auth-anonymous': '^1.0.0' },
        },
      },
    ];

    const result = selectDescriptorsWithProviders({
      items,
      getDescriptor: (item) => item.descriptor,
      withDescriptor: (item, descriptor) => ({ ...item, descriptor }),
      getSelectionGroupMembers: (item) =>
        item.grouping ? Object.keys(item.descriptor.dependencies ?? {}) : undefined,
      seed: { selected: ['application', 'anonymous-profile'] },
    });

    expect(result.providerSelection.slots).toMatchObject([
      {
        capabilityId: 'auth',
        selectedProviderId: 'auth-anonymous',
        mode: 'explicit',
      },
    ]);
  });

  it('keeps provider members of a dependency-reached grouping at dependency precedence', () => {
    type Item = { descriptor: Descriptor; grouping?: boolean };
    const items: Item[] = [
      { descriptor: { id: 'auth', version: '1.0.0' } },
      { descriptor: { id: 'auth-session', version: '1.0.0', providesFor: 'auth' } },
      {
        grouping: true,
        descriptor: {
          id: 'session-profile',
          version: '1.0.0',
          dependencies: { 'auth-session': '^1.0.0' },
        },
      },
      {
        descriptor: {
          id: 'application',
          version: '1.0.0',
          dependencies: { 'session-profile': '^1.0.0' },
        },
      },
    ];

    const result = selectDescriptorsWithProviders({
      items,
      getDescriptor: (item) => item.descriptor,
      withDescriptor: (item, descriptor) => ({ ...item, descriptor }),
      getSelectionGroupMembers: (item) =>
        item.grouping ? Object.keys(item.descriptor.dependencies ?? {}) : undefined,
      seed: { selected: ['application'] },
    });

    expect(result.providerSelection.slots).toMatchObject([
      { capabilityId: 'auth', selectedProviderId: 'auth-session', mode: 'dependency' },
    ]);
  });

  it('expands only the selected version of an explicitly named grouping', () => {
    type Item = { descriptor: Descriptor; grouping?: boolean; source: string };
    const items: Item[] = [
      { descriptor: { id: 'auth', version: '1.0.0' }, source: 'auth' },
      {
        descriptor: { id: 'auth-anonymous', version: '1.0.0', providesFor: 'auth' },
        source: 'anonymous',
      },
      {
        descriptor: { id: 'auth-session', version: '1.0.0', providesFor: 'auth' },
        source: 'session',
      },
      {
        grouping: true,
        descriptor: {
          id: 'profile',
          version: '1.0.0',
          dependencies: { 'auth-anonymous': '^1.0.0' },
        },
        source: 'profile-v1',
      },
      {
        grouping: true,
        descriptor: {
          id: 'profile',
          version: '2.0.0',
          dependencies: { 'auth-session': '^1.0.0' },
        },
        source: 'profile-v2',
      },
      {
        descriptor: { id: 'application', version: '1.0.0', dependencies: { profile: '^1.0.0' } },
        source: 'application',
      },
    ];

    const result = selectDescriptorsWithProviders({
      items,
      getDescriptor: (item) => item.descriptor,
      getSource: (item) => item.source,
      withDescriptor: (item, descriptor) => ({ ...item, descriptor }),
      getSelectionGroupMembers: (item) =>
        item.grouping ? Object.keys(item.descriptor.dependencies ?? {}) : undefined,
      seed: { selected: ['application', 'profile'] },
    });

    expect(result.items.find((item) => item.descriptor.id === 'profile')?.descriptor.version).toBe(
      '1.0.0',
    );
    expect(result.providerSelection.slots).toMatchObject([
      { capabilityId: 'auth', selectedProviderId: 'auth-anonymous', mode: 'explicit' },
    ]);
  });

  it('expands nested grouping cycles once and preserves explicit provider precedence', () => {
    type Item = { descriptor: Descriptor; grouping?: boolean };
    const items: Item[] = [
      { descriptor: { id: 'auth', version: '1.0.0' } },
      { descriptor: { id: 'auth-anonymous', version: '1.0.0', providesFor: 'auth' } },
      { descriptor: { id: 'auth-session', version: '1.0.0', providesFor: 'auth' } },
      {
        grouping: true,
        descriptor: { id: 'outer', version: '1.0.0', dependencies: { inner: '^1.0.0' } },
      },
      {
        grouping: true,
        descriptor: {
          id: 'inner',
          version: '1.0.0',
          dependencies: { outer: '^1.0.0', 'auth-anonymous': '^1.0.0' },
        },
      },
      {
        descriptor: {
          id: 'application',
          version: '1.0.0',
          dependencies: { 'auth-session': '^1.0.0' },
        },
      },
    ];

    const result = selectDescriptorsWithProviders({
      items,
      getDescriptor: (item) => item.descriptor,
      withDescriptor: (item, descriptor) => ({ ...item, descriptor }),
      getSelectionGroupMembers: (item) =>
        item.grouping ? Object.keys(item.descriptor.dependencies ?? {}) : undefined,
      seed: { selected: ['application', 'outer'] },
    });

    expect(result.providerSelection.slots).toMatchObject([
      { capabilityId: 'auth', selectedProviderId: 'auth-anonymous', mode: 'explicit' },
    ]);
  });

  it('fails when one directly selected grouping names competing providers', () => {
    type Item = { descriptor: Descriptor; grouping?: boolean };
    const items: Item[] = [
      { descriptor: { id: 'auth', version: '1.0.0' } },
      { descriptor: { id: 'auth-session', version: '1.0.0', providesFor: 'auth' } },
      { descriptor: { id: 'auth-anonymous', version: '1.0.0', providesFor: 'auth' } },
      {
        grouping: true,
        descriptor: {
          id: 'profile',
          version: '1.0.0',
          dependencies: { 'auth-session': '^1.0.0', 'auth-anonymous': '^1.0.0' },
        },
      },
    ];

    expect(() =>
      selectDescriptorsWithProviders({
        items,
        getDescriptor: (item) => item.descriptor,
        withDescriptor: (item, descriptor) => ({ ...item, descriptor }),
        getSelectionGroupMembers: (item) =>
          item.grouping ? Object.keys(item.descriptor.dependencies ?? {}) : undefined,
        seed: { selected: ['profile'] },
      }),
    ).toThrow(/auth.*auth-anonymous.*auth-session/s);
  });

  it('keeps an active provider slot visible and unfilled without a consumer', () => {
    const items: Descriptor[] = [
      { id: 'platform', version: '1.0.0' },
      { id: 'product', version: '1.0.0' },
      { id: 'product-a', version: '1.0.0', providesFor: 'product' },
      { id: 'product-b', version: '1.0.0', providesFor: 'product' },
    ];

    const result = selectDescriptorsWithProviders({
      items,
      getDescriptor: (descriptor) => descriptor,
      withDescriptor: (_item, descriptor) => descriptor,
      seed: { baseDescriptors: ['platform', 'product'] },
    });

    expect(result.items.map((descriptor) => descriptor.id)).toEqual(['platform', 'product']);
    expect(result.providerSelection).toEqual({
      slots: [
        {
          capabilityId: 'product',
          state: 'unfilled',
          required: false,
          candidateProviderIds: ['product-a', 'product-b'],
        },
      ],
      excludedProviderIds: ['product-a', 'product-b'],
    });
  });

  it('requires a provider when an active descriptor depends on the capability', () => {
    const items: Descriptor[] = [
      { id: 'auth', version: '1.0.0' },
      { id: 'auth-local', version: '1.0.0', providesFor: 'auth' },
      { id: 'auth-oidc', version: '1.0.0', providesFor: 'auth' },
      { id: 'web', version: '1.0.0', dependencies: { auth: '^1.0.0' } },
    ];

    expect(() => select(items, { selected: ['web'] })).toThrow(
      /capability "auth".*no provider was selected/s,
    );
  });

  it('lets a default fill an active slot without making it required', () => {
    const items: Descriptor[] = [
      { id: 'product', version: '1.0.0' },
      {
        id: 'product-a',
        version: '1.0.0',
        providesFor: 'product',
        defaultFor: 'product',
      },
      { id: 'product-b', version: '1.0.0', providesFor: 'product' },
    ];

    const result = selectDescriptorsWithProviders({
      items,
      getDescriptor: (descriptor) => descriptor,
      withDescriptor: (_item, descriptor) => descriptor,
      seed: { baseDescriptors: ['product'] },
    });

    expect(result.items.map((descriptor) => descriptor.id)).toEqual(['product', 'product-a']);
    expect(result.providerSelection.slots[0]).toMatchObject({
      capabilityId: 'product',
      state: 'selected',
      required: false,
      selectedProviderId: 'product-a',
      mode: 'default',
    });
  });

  it('does not let an unresolved consumer require a provider', () => {
    const items: Descriptor[] = [
      { id: 'auth', version: '1.0.0' },
      { id: 'auth-local', version: '1.0.0', providesFor: 'auth' },
      { id: 'web', version: '1.0.0', dependencies: { auth: '^1.0.0' } },
      { id: 'platform', version: '1.0.0' },
    ];

    const result = selectDescriptorsWithProviders({
      items,
      getDescriptor: (descriptor) => descriptor,
      withDescriptor: (_item, descriptor) => descriptor,
      seed: { baseDescriptors: ['auth', 'platform'] },
    });

    expect(result.providerSelection.slots[0]).toMatchObject({
      capabilityId: 'auth',
      state: 'unfilled',
      required: false,
    });
  });

  it('resolves base, selection, transitive dependencies, and the default provider', () => {
    expect(
      select(reference(), { baseDescriptors: ['platform', 'auth'], selected: ['dashboard'] }),
    ).toEqual(['auth', 'auth-session', 'dashboard', 'platform', 'tokens']);
  });

  it('lets an explicitly selected provider override and drop the default', () => {
    const ids = select(reference(), {
      baseDescriptors: ['platform', 'auth'],
      selected: ['dashboard', 'auth-oidc'],
    });
    expect(ids).toContain('auth-oidc');
    expect(ids).not.toContain('auth-session');
  });

  it('treats a provider in baseDescriptors as a seed choice', () => {
    expect(
      select(reference(), {
        baseDescriptors: ['auth', 'auth-oidc'],
        selected: ['dashboard'],
      }),
    ).toEqual(['auth', 'auth-oidc', 'dashboard']);
  });

  it('rejects distinct providers split across baseDescriptors and selected', () => {
    expect(() =>
      select(reference(), {
        baseDescriptors: ['auth', 'auth-session'],
        selected: ['dashboard', 'auth-oidc'],
      }),
    ).toThrow(/at most one selected provider per capability.*auth-oidc, auth-session/s);
  });

  it('keeps the base floor on independent of the selection', () => {
    expect(select(reference(), { baseDescriptors: ['reports'], selected: ['dashboard'] })).toEqual([
      'dashboard',
      'reports',
    ]);
  });

  it('applies provider defaults when every non-provider item participates', () => {
    expect(select(reference(), { selectionSeed: false })).toEqual([
      'auth',
      'auth-session',
      'dashboard',
      'platform',
      'reports',
      'tokens',
    ]);
  });

  it('treats a descriptor dependency on a provider as the provider choice', () => {
    const items = reference().concat({
      id: 'distribution',
      version: '1.0.0',
      dependencies: { auth: '^1.0.0', 'auth-oidc': '^1.0.0' },
    });

    expect(select(items, { selected: ['distribution'] })).toEqual([
      'auth',
      'auth-oidc',
      'distribution',
    ]);
  });

  it('lets an explicit provider root override a provider named by a descriptor dependency', () => {
    const items = reference().concat({
      id: 'distribution',
      version: '1.0.0',
      dependencies: { auth: '^1.0.0', 'auth-session': '^1.0.0' },
    });

    expect(select(items, { selected: ['distribution', 'auth-oidc'] })).toEqual([
      'auth',
      'auth-oidc',
      'distribution',
    ]);
  });

  it('rejects two dependency-selected providers at the same precedence', () => {
    const items = reference().concat({
      id: 'distribution',
      version: '1.0.0',
      dependencies: {
        auth: '^1.0.0',
        'auth-oidc': '^1.0.0',
        'auth-session': '^1.0.0',
      },
    });

    expect(() => select(items, { selected: ['distribution'] })).toThrow(
      /auth.*multiple dependency providers.*auth-oidc \(distribution\).*auth-session \(distribution\)/s,
    );
  });

  it('does not let an explicit provider root hide conflicting descriptor choices', () => {
    const items = reference().concat({
      id: 'distribution',
      version: '1.0.0',
      dependencies: {
        auth: '^1.0.0',
        'auth-oidc': '^1.0.0',
        'auth-session': '^1.0.0',
      },
    });

    expect(() => select(items, { selected: ['distribution', 'auth-oidc'] })).toThrow(
      /auth.*multiple dependency providers.*auth-oidc \(distribution\).*auth-session \(distribution\)/s,
    );
  });

  it('rejects removed providerPreferences metadata instead of silently ignoring it', () => {
    const items = reference().concat({
      id: 'distribution',
      version: '1.0.0',
      dependencies: { auth: '^1.0.0' },
      providerPreferences: { auth: 'auth-oidc' },
    });

    expect(() => select(items, { selected: ['distribution'] })).toThrow(
      /distribution.*providerPreferences.*dependencies/s,
    );
  });

  it('rejects removed providerPreferences metadata on disabled descriptors', () => {
    const items = reference().concat({
      id: 'legacy-disabled',
      version: '1.0.0',
      disabled: true,
      providerPreferences: { auth: 'auth-oidc' },
    });

    expect(() => select(items, { selected: ['dashboard'] })).toThrow(
      /legacy-disabled.*providerPreferences.*dependencies/s,
    );
  });

  it('filters out disabled items', () => {
    const items = reference().map((descriptor) =>
      descriptor.id === 'reports' ? { ...descriptor, disabled: true } : descriptor,
    );
    expect(select(items, { selectionSeed: false })).not.toContain('reports');
  });

  it('preserves the host item type through selection via getDescriptor/withDescriptor', () => {
    type Item = { descriptor: Descriptor; label: string };
    const items: Item[] = reference().map((descriptor) => ({
      descriptor,
      label: `item:${descriptor.id}`,
    }));

    // Provider selection rewrites losing relations; the wrapper fields must survive.
    const selected = selectDescriptors({
      items,
      getDescriptor: (item) => item.descriptor,
      withDescriptor: (item, descriptor) => ({ ...item, descriptor }),
      seed: { baseDescriptors: ['platform', 'auth'], selected: ['dashboard', 'auth-oidc'] },
    });

    expect(selected.every((item) => item.label === `item:${item.descriptor.id}`)).toBe(true);
    expect(selected.some((item) => item.descriptor.id === 'auth-oidc')).toBe(true);
    expect(selected.some((item) => item.descriptor.id === 'auth-session')).toBe(false);
  });

  it('handles array-form defaultFor (one provider is the default for several slots)', () => {
    const items: Descriptor[] = [
      { id: 'auth', version: '1.0.0' },
      { id: 'session', version: '1.0.0' },
      {
        id: 'local',
        version: '1.0.0',
        providesFor: ['auth', 'session'],
        defaultFor: ['auth', 'session'],
      },
    ];
    expect(select(items, { baseDescriptors: ['auth', 'session'] })).toEqual([
      'auth',
      'local',
      'session',
    ]);
  });

  it('rejects array-form defaultFor conflicts', () => {
    const items: Descriptor[] = [
      { id: 'auth', version: '1.0.0' },
      { id: 'a', version: '1.0.0', providesFor: 'auth', defaultFor: ['auth'] },
      { id: 'b', version: '1.0.0', providesFor: 'auth', defaultFor: ['auth'] },
    ];
    expect(() => select(items, { selected: ['auth'] })).toThrow(
      /exactly one defaultFor provider per capability.*a, b/s,
    );
  });

  it('rejects two providers that both declare defaultFor the same capability', () => {
    const items = reference().concat({
      id: 'auth-extra',
      version: '1.0.0',
      providesFor: 'auth',
      defaultFor: 'auth',
    });
    expect(() => select(items, { selected: ['auth'] })).toThrow(
      /exactly one defaultFor provider per capability.*auth-extra, auth-session/s,
    );
  });
});

describe('assertSingleDefaultProvider', () => {
  it('passes when each capability has at most one default provider', () => {
    expect(() => assertSingleDefaultProvider(reference())).not.toThrow();
  });
});

describe('assertSingleSelectedProvider', () => {
  it('passes when no provider is selected', () => {
    expect(() => assertSingleSelectedProvider(reference(), ['dashboard'])).not.toThrow();
  });

  it('passes when one provider of a capability is selected', () => {
    expect(() => assertSingleSelectedProvider(reference(), ['auth-oidc'])).not.toThrow();
  });

  it('rejects two selected providers of one capability and names both', () => {
    expect(() => assertSingleSelectedProvider(reference(), ['auth-oidc', 'auth-session'])).toThrow(
      /auth: auth-oidc, auth-session/,
    );
  });

  it('reads providesFor given as a list', () => {
    const descriptors: Descriptor[] = [
      { id: 'a', version: '1.0.0', providesFor: ['storage', 'auth'] },
      { id: 'b', version: '1.0.0', providesFor: 'auth' },
    ];
    expect(() => assertSingleSelectedProvider(descriptors, ['a', 'b'])).toThrow(/auth: a, b/);
  });
});

describe('selectDescriptors provider conflicts', () => {
  it('rejects a selection naming two providers of one capability', () => {
    expect(() => select(reference(), { selected: ['auth-oidc', 'auth-session'] })).toThrow(
      /at most one selected provider per capability/,
    );
  });
});

describe('assertKnownProviderCapabilities', () => {
  const declared: Descriptor[] = [
    { id: 'auth', version: '1.0.0' },
    { id: 'auth-oidc', version: '1.0.0', providesFor: 'auth' },
  ];

  it('accepts a capability some descriptor declares', () => {
    expect(() => assertKnownProviderCapabilities({ declared, providers: declared })).not.toThrow();
  });

  it('rejects a capability no descriptor declares, naming it and the provider', () => {
    const providers: Descriptor[] = [
      { id: 'pay-stripe', version: '1.0.0', providesFor: 'paymnets' },
    ];

    expect(() =>
      assertKnownProviderCapabilities({ declared: [...declared, ...providers], providers }),
    ).toThrow(/paymnets: pay-stripe/);
  });

  it('accepts a capability that is declared but takes no part in this composition', () => {
    // Checked against the discovered set, so a provider whose capability exists
    // elsewhere in the workspace is not a mistake.
    const providers: Descriptor[] = [
      { id: 'pay-stripe', version: '1.0.0', defaultFor: 'payments' },
    ];

    expect(() =>
      assertKnownProviderCapabilities({
        declared: [...declared, ...providers, { id: 'payments', version: '1.0.0' }],
        providers,
      }),
    ).not.toThrow();
  });
});
