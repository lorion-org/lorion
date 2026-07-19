import { Link, createFileRoute } from '@tanstack/react-router';
import type { ReactElement } from 'react';
import { usePaymentProvider } from '../../../payments/src';
import { useShops } from '../../../shops/src';

export const Route = createFileRoute('/shops/stationery')({
  component: StationeryShopPage,
});

function StationeryShopPage(): ReactElement {
  const shop = useShops().find((entry) => entry.slug === 'stationery');
  const paymentProvider = usePaymentProvider();
  const checkoutPath =
    paymentProvider?.createCheckoutPath({ shopId: shop?.slug ?? 'stationery' }) ?? '/';

  return (
    <main className="page page-compact">
      <Link to="/">Back</Link>
      <h1>{shop?.name ?? 'Demo shop'}</h1>
      <p>{shop?.tagline ?? 'Selected demo shop.'}</p>
      <a className="button" href={checkoutPath}>
        Checkout with {paymentProvider?.label ?? 'selected provider'}
      </a>
    </main>
  );
}
