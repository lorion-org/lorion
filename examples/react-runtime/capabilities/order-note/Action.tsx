import { useState, type ReactElement } from 'react';
import type { CheckoutActionProps } from '../checkout/contracts';
export default function Action({ shopId }: CheckoutActionProps): ReactElement {
  const [count, setCount] = useState(0);
  return (
    <button data-testid="order-note" onClick={() => setCount(count + 1)}>
      Order note for {shopId}: {count}
    </button>
  );
}
