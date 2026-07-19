import type { Descriptor } from '@lorion-org/composition-graph';

import { selectDescriptors } from '@lorion-org/descriptor-selection';

// The shared demo vocabulary: a platform base (with a graph-only `tokens` lib), an
// auth slot with a default and an alternative provider, a default feature, and an
// optional one. selectDescriptors is generic over the item type; here the items are
// plain descriptors, so getDescriptor/withDescriptor are the identity.
const descriptors: Descriptor[] = [
  { id: 'platform', version: '1.0.0', dependencies: { tokens: '^1.0.0' } },
  { id: 'tokens', version: '1.0.0' },
  { id: 'auth', version: '1.0.0' },
  { id: 'auth-local', version: '1.0.0', providesFor: 'auth', defaultFor: 'auth' },
  { id: 'auth-oidc', version: '1.0.0', providesFor: 'auth' },
  { id: 'dashboard', version: '1.0.0' },
  { id: 'reports', version: '1.0.0' },
];

// Base platform + auth are always on; `dashboard` is selected. The graph pulls the
// platform's `tokens` dep and resolves the single default auth provider (auth-local).
const active = selectDescriptors({
  items: descriptors,
  getDescriptor: (descriptor) => descriptor,
  withDescriptor: (_item, descriptor) => descriptor,
  seed: { baseDescriptors: ['platform', 'auth'], selected: ['dashboard'] },
});

console.log(active.map((descriptor) => descriptor.id));
// ['platform', 'tokens', 'auth', 'auth-local', 'dashboard']

// Selecting an alternative provider overrides the default and drops it.
const overridden = selectDescriptors({
  items: descriptors,
  getDescriptor: (descriptor) => descriptor,
  withDescriptor: (_item, descriptor) => descriptor,
  seed: { baseDescriptors: ['platform', 'auth'], selected: ['dashboard', 'reports', 'auth-oidc'] },
});

console.log(overridden.map((descriptor) => descriptor.id));
// ['platform', 'tokens', 'auth', 'auth-oidc', 'dashboard', 'reports']
