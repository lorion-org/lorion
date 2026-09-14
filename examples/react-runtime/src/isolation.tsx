import { useState, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ContributionProvider,
  createContributionRuntime,
  defineContributionPoint,
  useContributions,
} from '@lorion-org/react/contributions';
import type { Shop } from '../capabilities/shops/contracts';
import { contributionModules, contributionPlan } from 'virtual:lorion-contributions';
const point = defineContributionPoint<Shop>({ owner: 'shops', point: 'shop' });
function Consumer({ id }: { id: string }): ReactElement {
  const items = useContributions(point);
  const [, update] = useState(0);
  const coffee = items.find((item) => item.id === 'shop-coffee')!.value;
  return (
    <section aria-label={id}>
      <p>{coffee.name}</p>
      <button
        onClick={() => {
          coffee.name = 'Changed in first root';
          update((value) => value + 1);
        }}
      >
        Change factory payload
      </button>
      <button onClick={() => update((value) => value + 1)}>Read current payload</button>
    </section>
  );
}
for (const id of ['first', 'second']) {
  const runtime = createContributionRuntime({
    plan: contributionPlan,
    modules: contributionModules,
  });
  createRoot(document.getElementById(id)!).render(
    <ContributionProvider runtime={runtime}>
      <Consumer id={id} />
    </ContributionProvider>,
  );
}
