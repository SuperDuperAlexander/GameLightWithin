import { test, expect } from '@playwright/test';

/**
 * The game must never talk to the network. No analytics, no CDN, no fonts
 * from outside. Everything is served from its own origin.
 */
test('makes no request to any outside origin', async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? 'http://127.0.0.1:4173').origin;
  const outside: string[] = [];

  page.on('request', (r) => {
    const url = r.url();
    if (url.startsWith('data:') || url.startsWith('blob:')) return;
    if (!url.startsWith(origin)) outside.push(`${r.method()} ${url}`);
  });

  await page.goto('/?debug=1&autobreathe=1');
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.getByRole('button', { name: 'Begin' }).click();
  for (const group of ['receive', 'calm']) {
    await page.locator(`[aria-label="${group}"] button[data-value="3"]`).click();
  }
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(6000);

  expect(outside, `outside requests: ${outside.join(', ')}`).toEqual([]);
});

test('serves the font from its own origin', async ({ page }) => {
  const fonts: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'font') fonts.push(r.url());
  });
  await page.goto('/?debug=1');
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.waitForTimeout(1500);
  for (const url of fonts) expect(url).toContain('/fonts/');
});
