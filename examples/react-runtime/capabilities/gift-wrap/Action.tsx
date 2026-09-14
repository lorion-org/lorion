import { useState, type ReactElement } from 'react';
import type { CheckoutActionProps } from '../checkout/contracts';
export default function Action({ shopId }: CheckoutActionProps): ReactElement {
  const [count, setCount] = useState(0);
  return (
    <button data-testid="gift-wrap" onClick={() => setCount(count + 1)}>
      Gift wrap for {shopId}: {count}
    </button>
  );
}
