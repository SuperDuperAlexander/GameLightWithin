import { test } from '@playwright/test';
import { answerQuestions, snap, startChapter } from './helpers';

test('scene 1 probe', async ({ page }) => {
  test.setTimeout(240_000);
  const url = process.env.LW_URL ?? '/?autobreathe=1&debug=1&quality=medium';
  await startChapter(page, url);
  await page.getByRole('button', { name: 'Begin' }).click();
  await answerQuestions(page, 3);
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(5000);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(await snap(page)));
  }
});
