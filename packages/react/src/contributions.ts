import { createContext, createElement, useContext, type ReactElement, type ReactNode } from 'react';
import type {
  ContributionPoint,
  ContributionRuntime,
  ResolvedContributionItem,
} from '@lorion-org/contributions';

export * from '@lorion-org/contributions';

const context = createContext<ContributionRuntime | null>(null);

export function ContributionProvider(props: {
  runtime: ContributionRuntime;
  children?: ReactNode;
}): ReactElement {
  return createElement(context.Provider, { value: props.runtime }, props.children);
}

export function useContributions<T>(
  point: ContributionPoint<T>,
): readonly ResolvedContributionItem<T>[] {
  const runtime = useContext(context);
  if (!runtime) throw new Error('useContributions must be used inside ContributionProvider.');
  return runtime.get(point);
}
