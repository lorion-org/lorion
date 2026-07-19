import type { ReactElement } from 'react';
import { usePaymentProvider } from '../../payments/src';
import { useShops } from '../../shops/src';

export function StationeryShopPage(): ReactElement {
  const shop = useShops().find((entry) => entry.slug === 'stationery');
  const paymentProvider = usePaymentProvider();
  const checkoutPath =
    paymentProvider?.createCheckoutPath({ shopId: shop?.slug ?? 'stationery' }) ?? '/';

  return (
    <main className="page page-compact">
      <a href="/">Back</a>
      <h1>{shop?.name ?? 'Demo shop'}</h1>
      <p>{shop?.tagline ?? 'Selected demo shop.'}</p>
      <a className="button" href={checkoutPath}>
        Checkout with {paymentProvider?.label ?? 'selected provider'}
      </a>
    </main>
  );
}
