import { createRegistryHub } from '@lorion-org/registry-hub';
import process from 'node:process';

const hub = createRegistryHub();

hub.register('commands', { id: 'build', command: 'pnpm build' });
hub.register('tools', { id: 'lint', title: 'Lint workspace' });

process.stdout.write(`${JSON.stringify(hub.list('commands'))}\n`);
process.stdout.write(`${JSON.stringify(hub.get('tools', 'lint'))}\n`);
