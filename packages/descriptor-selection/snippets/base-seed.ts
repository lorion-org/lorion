import { resolveBaseSelection } from '@lorion-org/descriptor-selection';

// The always-on base floor resolves separately from the selection. `baseSeed` is a
// CLI/env override for it, symmetric to `selectionSeed`: with nothing configured the
// static `baseDescriptors` stand.
console.log(resolveBaseSelection({ baseDescriptors: ['commerce'] }));
// ['commerce']

// A parsed env value replaces the base floor (e.g. `LORION_BASE=slim`), so a host
// exposes the base as an env/CLI knob without owning any parsing itself.
console.log(
  resolveBaseSelection({
    baseDescriptors: ['commerce'],
    baseSeed: { argv: [], env: { LORION_BASE: 'slim' }, envKeys: ['LORION_BASE'] },
  }),
);
// ['slim']

// When the override parses nothing, `baseDescriptors` still stand.
console.log(
  resolveBaseSelection({
    baseDescriptors: ['commerce'],
    baseSeed: { argv: [], env: {}, envKeys: ['LORION_BASE'] },
  }),
);
// ['commerce']
