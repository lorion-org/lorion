import { expect, test } from '@playwright/test';

const profile = process.env.LORION_EXAMPLE_PROFILE ?? 'actions';
const expected: Record<string, { version: string; name: string }> = {
  beta: { version: '3.0.0-beta.2', name: 'Bean Supply Beta 3' },
  'beta-cli': { version: '3.0.0-beta.2', name: 'Bean Supply Beta 3' },
  'beta-compatible': { version: '2.0.0-beta.1', name: 'Bean Supply Beta 2' },
  curated: { version: '2.0.0-beta.1', name: 'Bean Supply Beta 2' },
  'curated-compatible': { version: '1.0.0', name: 'Bean Supply' },
};

test('renders the candidate selected by the host policy and active requirements', async ({
  page,
}) => {
  const candidate = expected[profile];
  test.skip(!candidate, 'Requires a named-selector profile.');
  if (!candidate) return;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type()) && /hydration/i.test(message.text()))
      errors.push(message.text());
  });
  await page.goto('/tech');
  await expect(page.getByText(`shop-coffee@${candidate.version}`, { exact: true })).toBeVisible();
  await page.goto('/shops/coffee');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(candidate.name);
  expect(errors).toEqual([]);
});
