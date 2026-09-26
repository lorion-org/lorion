import { describe, expect, it } from 'vitest';
import { createContributionRuntime, type ContributionModule } from '@lorion-org/contributions';
import type { Descriptor } from '@lorion-org/composition-graph';
import { projectContributionPlan } from './contributions';

const owner: Descriptor = { id: 'owner', version: '1.0.0', contributionPoints: ['items', 'items'] };
const owner2: Descriptor = { ...owner, version: '2.0.0' };
const guest: Descriptor = {
  id: 'guest',
  version: '1.0.0',
  contributesTo: { owner: ['items', 'items'] },
};
const catalog = [owner, owner2, guest];
describe('projectContributionPlan', () => {
  it('binds exact versions, normalizes repeated metadata and ignores copied selected fields', () => {
    const result = projectContributionPlan({
      catalog,
      selected: [{ ...owner2, contributionPoints: ['wrong'] }, guest, guest],
    });
    expect(result).toEqual({
      selected: [
        { id: 'guest', version: '1.0.0' },
        { id: 'owner', version: '2.0.0' },
      ],
      points: [{ owner: 'owner', point: 'items', ownerVersion: '2.0.0' }],
      edges: [
        {
          source: { id: 'guest', version: '1.0.0' },
          target: { owner: 'owner', point: 'items' },
          active: true,
          ownerVersion: '2.0.0',
        },
      ],
    });
    expect(
      projectContributionPlan({ catalog: [...catalog].reverse(), selected: [guest, owner2] }),
    ).toEqual(result);
  });
  it('collapses inactive version candidates and produces a usable inactive runtime', () => {
    const plan = projectContributionPlan({ catalog, selected: [guest] });
    const modules: ContributionModule[] = [
      {
        id: guest.id,
        version: guest.version,
        create: () => ({
          contributions: [
            { target: { owner: 'owner', point: 'items' }, items: [{ id: 'x', value: 1 }] },
          ],
        }),
      },
    ];
    expect(plan.edges).toHaveLength(1);
    expect(createContributionRuntime({ plan, modules }).inspect()).toMatchObject([
      { status: 'owner-not-selected' },
    ]);
  });
  it('rejects unknown identities and conflicting selected versions', () => {
    expect(() =>
      projectContributionPlan({ catalog, selected: [{ ...guest, version: '3.0.0' }] }),
    ).toThrowError(matchingError({ code: 'INVALID_PLAN' }));
    expect(() => projectContributionPlan({ catalog, selected: [owner, owner2] })).toThrowError(
      matchingError({ code: 'INVALID_PLAN' }),
    );
  });
  it('retains graph validation for optional owners with incompatible vocabulary', () => {
    expect(() =>
      projectContributionPlan({
        catalog: [owner, { ...owner2, contributionPoints: ['other'] }, guest],
        selected: [guest],
      }),
    ).toThrow(/declares/);
  });
});

it.each([
  null,
  { id: { secret: 'PRIVATE_MARKER' }, version: '1.0.0' },
  { id: 'guest', version: { secret: 'PRIVATE_MARKER' } },
])('rejects malformed selected identities without exposing them', (candidate) => {
  try {
    projectContributionPlan({ catalog, selected: [candidate] as never });
    throw new Error('expected failure');
  } catch (error) {
    expect(error).toMatchObject({ code: 'INVALID_PLAN' });
    expect(JSON.stringify(error)).not.toContain('PRIVATE_MARKER');
  }
});

function matchingError(value: Record<string, unknown>): Error {
  return expect.objectContaining(value) as Error;
}
