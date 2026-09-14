import { expect, test as base } from '@playwright/test';
const profile = process.env.LORION_EXAMPLE_PROFILE ?? 'actions';
const test = base.extend<{ errors: string[] }>({
  errors: async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type()) && /hydration/i.test(message.text()))
        errors.push(message.text());
    });
    await use(errors);
  },
});
test('selected composition, native rendering and isolated application lifetime', async ({
  page,
  request,
  errors,
}, testInfo) => {
  test.skip(profile.startsWith('failure-'), 'Failure profiles exercise native startup separately.');
  await page.goto('/tech');
  const report = JSON.parse(await page.getByTestId('contribution-inspection').innerText()) as {
    source: { id: string; version: string };
    target: { owner: string; point: string };
    status: string;
    id: string;
  }[];
  if (profile === 'inactive') {
    await expect(page.getByRole('link', { name: 'Back', exact: true })).toHaveCount(0);
    expect(report).toEqual([
      {
        source: { id: 'gift-wrap', version: '1.0.0' },
        target: { owner: 'checkout', point: 'actions' },
        id: 'gift-wrap',
        order: 10,
        status: 'owner-not-selected',
      },
    ]);
    expect(await page.locator('body').innerText()).not.toContain('checkout@1.0.0');
    expect(errors).toEqual([]);
    return;
  }
  if (profile === 'provider-only') {
    await page.goto('/providers/payment-provider-stripe/checkout?shop=coffee');
    await expect(page.getByText('No checkout actions.')).toBeVisible();
    expect(errors).toEqual([]);
    return;
  }
  expect(report.filter((row) => row.target.owner === 'shops').map((row) => row.id)).toEqual([
    'shop-coffee',
    'shop-stationery',
  ]);
  expect(report.find((row) => row.id === 'shop-coffee')?.source.version).toBe(
    profile.startsWith('legacy') ? '1.0.0' : '2.0.0',
  );
  const provider = profile === 'invoice' ? 'invoice' : 'stripe';
  expect(report.filter((row) => row.target.owner === 'payments').map((row) => row.id)).toEqual([
    `payment-provider-${provider}`,
  ]);
  await page.getByRole('link', { name: 'Back', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page
      .getByRole('link')
      .filter({ hasText: profile.startsWith('legacy') ? 'Bean Supply' : 'Bean Supply Plus' }),
  ).toHaveCount(1);
  await page.goto('/shops/coffee');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    profile.startsWith('legacy') ? 'Bean Supply' : 'Bean Supply Plus',
  );
  await page.getByRole('link', { name: /Checkout with/ }).click();
  await expect(page).toHaveURL(new RegExp(`/providers/payment-provider-${provider}/checkout`));
  if (profile === 'actions') {
    expect(report.filter((row) => row.target.owner === 'checkout').map((row) => row.id)).toEqual([
      'gift-wrap',
      'order-note',
    ]);
    const wrap = page.getByTestId('gift-wrap');
    await expect(wrap).toHaveText('Gift wrap for coffee: 0');
    await wrap.click();
    await expect(wrap).toHaveText('Gift wrap for coffee: 1');
    await wrap.focus();
    await page.keyboard.press('Enter');
    await expect(wrap).toHaveText('Gift wrap for coffee: 2');
    await page.getByTestId('order-note').focus();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('order-note')).toHaveText('Order note for coffee: 1');
    await page.getByRole('link', { name: /Back/ }).click();
    await expect(wrap).toHaveCount(0);
    await page.goto(`/providers/payment-provider-${provider}/checkout?shop=coffee`);
    await expect(wrap).toHaveText('Gift wrap for coffee: 0');
    if (testInfo.project.name === 'nuxt') {
      for (let i = 0; i < 2; i++) {
        const response = await request.get(
          `/providers/payment-provider-${provider}/checkout?shop=coffee`,
        );
        expect(response.ok()).toBe(true);
        expect(await response.text()).toContain('Gift wrap for coffee: 0');
      }
    }
  } else await expect(page.getByText('No checkout actions.')).toBeVisible();
  if (profile === 'actions' && testInfo.project.name === 'react') {
    await page.goto('/isolation.html');
    const first = page.getByRole('region', { name: 'first', exact: true });
    const second = page.getByRole('region', { name: 'second', exact: true });
    await expect(first.getByText('Bean Supply Plus')).toBeVisible();
    await expect(second.getByText('Bean Supply Plus')).toBeVisible();
    await first.getByRole('button', { name: 'Change factory payload' }).click();
    await second.getByRole('button', { name: 'Read current payload' }).click();
    await expect(first.getByText('Changed in first root')).toBeVisible();
    await expect(second.getByText('Bean Supply Plus')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('captures native browser hydration warnings and production errors', async ({
  page,
  errors,
}) => {
  test.skip(profile !== 'normal', 'The shared observer is checked once per framework.');
  await page.goto('about:blank');
  await page.evaluate(() => {
    console.warn('Hydration warning fixture');
    console.error('Hydration completed but contains mismatches.');
  });
  await expect
    .poll(() => errors)
    .toEqual(['Hydration warning fixture', 'Hydration completed but contains mismatches.']);
});

test('rejects invalid contributions through native application startup', async ({
  page,
  request,
}, testInfo) => {
  test.skip(!profile.startsWith('failure-'), 'Requires an intentionally invalid composition.');
  const browserDiagnostics: string[] = [];
  page.on('pageerror', (error) => browserDiagnostics.push(error.message, error.stack ?? ''));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) browserDiagnostics.push(message.text());
  });
  const code = profile === 'failure-duplicate' ? 'DUPLICATE_ITEM' : 'MODULE_FACTORY_FAILED';
  const details = {
    source: { id: profile, version: '1.0.0' },
    ...(profile === 'failure-duplicate'
      ? { target: { owner: 'checkout', point: 'actions' }, itemId: 'duplicate' }
      : {}),
  };
  if (testInfo.project.name === 'react') {
    await page.addInitScript(() => {
      Object.assign(window, { contributionFailures: [] });
      window.addEventListener('error', (event) => {
        (window as unknown as { contributionFailures: unknown[] }).contributionFailures.push({
          code: event.error?.code,
          message: event.message,
          stack: event.error?.stack,
          details: event.error?.details,
        });
      });
    });
    await page.goto('/tech');
    const failures = () =>
      page.evaluate(
        () =>
          (window as unknown as { contributionFailures: { code: string; details: unknown }[] })
            .contributionFailures,
      );
    await expect.poll(async () => (await failures()).map((error) => error.code)).toContain(code);
    expect((await failures()).find((error) => error.code === code)).toMatchObject({
      code,
      details,
    });
    await expect(page.locator('#root')).toBeEmpty();
    expect(JSON.stringify(await failures())).not.toMatch(
      /PRIVATE_CONTRIBUTION_VALUE|PRIVATE_FACTORY_DETAIL/,
    );
  } else {
    const response = await request.get('/tech');
    expect(response.status()).toBe(500);
    const diagnostic = JSON.parse(response.headers()['x-lorion-contribution-error']!) as {
      code: string;
      runtimeExposed: boolean;
    };
    expect(diagnostic).toMatchObject({ code, details });
    expect(diagnostic.runtimeExposed).toBe(false);
    const body = await response.text();
    expect(body).not.toContain('contribution-inspection');
    expect(body + JSON.stringify(diagnostic)).not.toMatch(
      /PRIVATE_CONTRIBUTION_VALUE|PRIVATE_FACTORY_DETAIL/,
    );
    await page.goto('/tech');
    await expect(page.getByRole('heading', { name: 'Tech monitor' })).toHaveCount(0);
    expect(await page.locator('body').innerText()).not.toMatch(
      /PRIVATE_CONTRIBUTION_VALUE|PRIVATE_FACTORY_DETAIL/,
    );
  }
  expect(browserDiagnostics.join('\n')).not.toMatch(
    /PRIVATE_CONTRIBUTION_VALUE|PRIVATE_FACTORY_DETAIL/,
  );
});
