import { createRegistryHub, type RegistryItem } from '@lorion-org/registry-hub';

type Command = RegistryItem & {
  command: string;
};

type Tool = RegistryItem & {
  title: string;
};

const hub = createRegistryHub();

hub.register<Command>('commands', { id: 'build', command: 'pnpm build' });
hub.register<Tool>('tools', { id: 'lint', title: 'Lint workspace' });

console.log(hub.list<Command>('commands'));
// [{ id: 'build', command: 'pnpm build' }]

console.log(hub.get<Tool>('tools', 'lint'));
// { id: 'lint', title: 'Lint workspace' }
