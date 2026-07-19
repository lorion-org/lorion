import { Link, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';

export const Route = createFileRoute('/providers/payment-provider-stripe/checkout')({
  component: StripeCheckoutPage,
});

function StripeCheckoutPage(): ReactElement {
  const params = new URLSearchParams(window.location.search);
  const shopId = params.get('shop') ?? 'coffee';

  return (
    <main className="page page-compact">
      <Link to="/">Back to shops</Link>
      <h1>Stripe checkout</h1>
      <p>Shop: {shopId}</p>
      <p>This page is contributed by the Stripe provider capability.</p>
    </main>
  );
}
