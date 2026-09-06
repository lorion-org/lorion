import { defineWebPlugin } from '@acme/plugin';
import { ReceiptsPage } from './ReceiptsPage';

// A capability from a second checkout. Nothing about it differs from the ones in
// this repository: it declares a descriptor beside its manifest, ships the web
// surface marker, and takes part in the same graph. Only its root is another one.
export const receiptsWebPlugin = defineWebPlugin({
  id: 'receipts',
  routes: [{ path: '/receipts', Component: ReceiptsPage }],
});
