import { resolveItemProviderSelection } from '@lorion-org/provider-selection';

type CommandHandler = {
  commandId: string;
  handlerId: string;
};

const handlers: CommandHandler[] = [
  {
    commandId: 'open',
    handlerId: 'open-native',
  },
  {
    commandId: 'open',
    handlerId: 'open-web',
  },
  {
    commandId: 'share',
    handlerId: 'share-link',
  },
];

const result = resolveItemProviderSelection({
  items: handlers,
  getCapabilityId: (handler) => handler.commandId,
  getProviderId: (handler) => handler.handlerId,
  configuredProviders: {
    open: 'open-web',
  },
});

console.log(result.providersByCapability);
// { open: ['open-native', 'open-web'], share: ['share-link'] }

console.log(result.selections);
// {
//   open: { selectedProviderId: 'open-web', mode: 'configured' },
//   share: { selectedProviderId: 'share-link', mode: 'first' }
// }

console.log(result.mismatches);
// []

console.log(result.excludedProviderIds);
// ['open-native']
