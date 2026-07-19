import type { ReactElement } from 'react';

export function StripeCheckoutPage(): ReactElement {
  const params = new URLSearchParams(window.location.search);
  const shopId = params.get('shop') ?? 'coffee';

  return (
    <main className="page page-compact">
      <a href="/">Back to shops</a>
      <h1>Stripe checkout</h1>
      <p>Shop: {shopId}</p>
      <p>This page is contributed by the Stripe provider capability.</p>
    </main>
  );
}
