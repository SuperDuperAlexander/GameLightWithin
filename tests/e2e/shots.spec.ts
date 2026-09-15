import { test } from '@playwright/test';

test('look at the screens', async ({ page }, info) => {
  const tag = info.project.name;
  await page.goto('/?debug=1&quality=high');
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `screenshots/_look-start-${tag}.png` });

  await page.getByRole('button', { name: 'Begin' }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `screenshots/_look-questions-${tag}.png` });

  for (const group of ['receive', 'calm']) {
    await page.locator(`[aria-label="${group}"] button[data-value="3"]`).click();
  }
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `screenshots/_look-scene1-${tag}.png` });
});
