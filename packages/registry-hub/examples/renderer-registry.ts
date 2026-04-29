import { createRegistry, type RegistryItem } from '@lorion-org/registry-hub';

type FieldRenderer = RegistryItem & {
  component: string;
};

const renderers = createRegistry<FieldRenderer>('field-renderers');

renderers.register([
  { id: 'text', component: 'TextFieldRenderer' },
  { id: 'date', component: 'DateFieldRenderer' },
]);

console.log(renderers.entries());
// [
//   ['text', { id: 'text', component: 'TextFieldRenderer' }],
//   ['date', { id: 'date', component: 'DateFieldRenderer' }]
// ]
