import type { ReactElement } from 'react';
import { usePaymentProvider } from '../../payments/src';
import { useShops } from '../../shops/src';

export function CoffeeShopPage(): ReactElement {
  const shop = useShops().find((entry) => entry.slug === 'coffee');
  const paymentProvider = usePaymentProvider();
  const checkoutPath =
    paymentProvider?.createCheckoutPath({ shopId: shop?.slug ?? 'coffee' }) ?? '/';

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
