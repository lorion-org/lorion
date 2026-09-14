import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ContributionProvider,
  createContributionRuntime,
  defineContributionPoint,
  useContributions,
} from './contributions';
const point = defineContributionPoint<{ count: number }>({ owner: 'owner', point: 'items' });
function runtime() {
  return createContributionRuntime({
    plan: {
      selected: [
        { id: 'owner', version: '1' },
        { id: 'guest', version: '1' },
      ],
      points: [{ ...point, ownerVersion: '1' }],
      edges: [
        { source: { id: 'guest', version: '1' }, target: point, active: true, ownerVersion: '1' },
      ],
    },
    modules: [
      { id: 'owner', version: '1', create: () => ({ points: [point] }) },
      {
        id: 'guest',
        version: '1',
        create: () => ({
          contributions: [{ target: point, items: [{ id: 'item', value: { count: 0 } }] }],
        }),
      },
    ],
  });
}
function Consumer() {
  return createElement('span', null, useContributions(point)[0]?.value.count ?? 'empty');
}
describe('React contribution binding', () => {
  it('requires an explicit provider', () => {
    expect(() => renderToString(createElement(Consumer))).toThrow(/ContributionProvider/);
  });
  it('keeps application roots and repeated server renders isolated', () => {
    const a = runtime();
    const b = runtime();
    a.get(point)[0]!.value.count = 3;
    const render = (value: ReturnType<typeof runtime>) =>
      renderToString(
        createElement(ContributionProvider, { runtime: value }, createElement(Consumer)),
      );
    expect(render(a)).toBe('<span>3</span>');
    expect(render(b)).toBe('<span>0</span>');
    expect(render(b)).toBe('<span>0</span>');
  });
  it('resolves from the nearest provider and permits valid empty collections', () => {
    const empty = createContributionRuntime({
      plan: { selected: [], points: [], edges: [] },
      modules: [],
    });
    expect(
      renderToString(
        createElement(
          ContributionProvider,
          { runtime: runtime() },
          createElement(ContributionProvider, { runtime: empty }, createElement(Consumer)),
        ),
      ),
    ).toBe('<span>empty</span>');
  });
});
