import { Link, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { usePaymentProvider } from '../../../payments/src';
import { useShops } from '../index';

export const Route = createFileRoute('/')({
  component: ShopsPage,
});

function ShopsPage(): ReactElement {
  const shops = useShops();
  const paymentProvider = usePaymentProvider();
  const paymentProviderLabel = paymentProvider?.label ?? 'selected provider';

  return (
    <main className="page page-narrow">
      <header className="row-header">
        <h1>Demo shops</h1>
        <Link to="/tech">Tech monitor</Link>
      </header>

      <section className="shops">
        {shops.map((shop) => (
          <a key={shop.id} className="link-card" href={shop.path}>
            <strong>{shop.name}</strong>
            <span>{shop.tagline}</span>
            <small>Checkout with {paymentProviderLabel}</small>
          </a>
        ))}
      </section>
    </main>
  );
}
