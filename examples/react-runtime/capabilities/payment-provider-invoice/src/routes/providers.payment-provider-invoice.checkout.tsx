import { Link, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

export const Route = createFileRoute('/providers/payment-provider-invoice/checkout')({
  component: InvoiceCheckoutPage,
});

function InvoiceCheckoutPage(): ReactElement {
  const params = new URLSearchParams(window.location.search);
  const shopId = params.get('shop') ?? 'coffee';

  return (
    <main className="page page-compact">
      <Link to="/">Back to shops</Link>
      <h1>Invoice checkout</h1>
      <p>Shop: {shopId}</p>
      <p>This page is contributed by the invoice provider capability.</p>
    </main>
  );
}
