import type { ReactElement } from 'react';
import { usePaymentProvider } from '@acme/payments';

export function ReceiptsPage(): ReactElement {
  const paymentProvider = usePaymentProvider();

  return (
    <main className="page page-compact">
      <a href="/">Back</a>
      <h1>Receipts</h1>
      <p>
        Receipts are issued for checkouts paid through{' '}
        <strong>{paymentProvider?.label ?? 'the selected provider'}</strong>.
      </p>
      <p>
        This capability lives in a second checkout, joined into the same package set. It reaches{' '}
        <code>@acme/payments</code> through the package specifier its manifest declares, not through
        a relative path into another root.
      </p>
    </main>
  );
}
