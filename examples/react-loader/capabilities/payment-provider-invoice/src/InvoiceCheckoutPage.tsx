import type { ReactElement } from 'react';

export function InvoiceCheckoutPage(): ReactElement {
  const params = new URLSearchParams(window.location.search);
  const shopId = params.get('shop') ?? 'coffee';

  return (
    <main className="page page-compact">
      <a href="/">Back to shops</a>
      <h1>Invoice checkout</h1>
      <p>Shop: {shopId}</p>
      <p>This page is contributed by the invoice provider capability.</p>
    </main>
  );
}
