import { defineContributionPoint } from '@lorion-org/contributions';
import { useLorionContributions as explicit } from '#imports';

// Compile this consumer against Nuxt's generated imports, where a missing declaration
// would otherwise silently erase the payload type from an untyped generated module.
export function checkContributionTypes(): void {
  const point = defineContributionPoint<{ label: string }>({ owner: 'example', point: 'items' });
  const implicitItems = useLorionContributions(point);
  const explicitItems = explicit(point);
  const label: string | undefined = explicitItems[0]?.value.label;
  // @ts-expect-error The explicit Nuxt import retains the point payload type.
  const wrongExplicit: number = explicitItems[0]!.value.label;
  // @ts-expect-error The global auto-import retains the point payload type.
  const wrongImplicit: number = implicitItems[0]!.value.label;
  // @ts-expect-error Collection structure remains readonly through the generated binding.
  implicitItems.push({ id: 'x', order: 0, value: { label: 'x' } });
  void [label, wrongExplicit, wrongImplicit];
}
