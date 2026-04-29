import { resolveItemProviderSelection } from '@lorion-org/provider-selection';

type StorageDriver = {
  storageKind: string;
  driverId: string;
};

const drivers: StorageDriver[] = [
  {
    storageKind: 'blob',
    driverId: 's3',
  },
  {
    storageKind: 'blob',
    driverId: 'filesystem',
  },
  {
    storageKind: 'queue',
    driverId: 'redis-streams',
  },
];

const result = resolveItemProviderSelection({
  items: drivers,
  getCapabilityId: (driver) => driver.storageKind,
  getProviderId: (driver) => driver.driverId,
  fallbackProviders: {
    blob: 'filesystem',
  },
});

console.log(result.selections);
// {
//   blob: { selectedProviderId: 'filesystem', mode: 'fallback' },
//   queue: { selectedProviderId: 'redis-streams', mode: 'first' }
// }

console.log(result.mismatches);
// []
