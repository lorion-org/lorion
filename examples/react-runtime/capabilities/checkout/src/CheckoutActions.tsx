import { useContributions } from '@lorion-org/react/contributions';
import type { ReactElement } from 'react';
import { point } from '../contributions';
import type { CheckoutActionProps } from '../contracts';
export function CheckoutActions(props: CheckoutActionProps): ReactElement {
  const items = useContributions(point);
  return (
    <section aria-label="Checkout actions">
      {items.length ? (
        items.map(({ id, value }) => <value.component key={id} {...props} />)
      ) : (
        <p>No checkout actions.</p>
      )}
    </section>
  );
}
