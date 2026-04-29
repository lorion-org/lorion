import { createRegistry } from '@lorion-org/registry-hub';
import process from 'node:process';

const renderers = createRegistry('field-renderers');

renderers.register([
  { id: 'text', component: 'TextFieldRenderer' },
  { id: 'date', component: 'DateFieldRenderer' },
]);

process.stdout.write(
  `${renderers.id}:${renderers
    .entries()
    .map(([id]) => id)
    .join(',')}\n`,
);
