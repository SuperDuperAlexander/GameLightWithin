import { test, expect } from '@playwright/test';
import { snap, waitForSnap } from './helpers';

test('space and shift make a breath, and the stride opens up', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => {
    localStorage.setItem(
      'lightwithin.settings.v1',
      JSON.stringify({
        rhythm: 'easy',
        quality: 'low',
        volume: 0,
        muted: true,
        reducedMotion: false,
      }),
    );
  });
  await page.goto('/?scene=1&debug=1&quality=low&nopaint=1');
  await page.waitForFunction(() => document.body.dataset.ready === '1');
  // Wait for the renderer to actually be running before timing anything.
  await waitForSnap(page, (s) => s.fps > 0, 'the first frames', 90_000);
  await page.waitForTimeout(1200);

  // The player can walk straight away, but slowly.
  const a = await snap(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(400);
  const b = await snap(page);
  const slow = Math.abs(b.pz - a.pz);
  expect(slow, 'the player is never held still').toBeGreaterThan(0.5);

  // One breath: hold space, then hold shift, then let go.
  await page.keyboard.down('Space');
  await page.waitForTimeout(3000);
  await page.keyboard.up('Space');
  await page.keyboard.down('Shift');
  await page.waitForTimeout(4000);
  await page.keyboard.up('Shift');
  await page.waitForTimeout(600);

  const c = await snap(page);
  expect(c.breathsTotal, 'the two keys completed a breath').toBeGreaterThanOrEqual(1);
  expect(c.breathsCalm, 'and it was calm').toBeGreaterThanOrEqual(1);
  expect(c.scene, 'one calm breath is enough to wake the valley').toBeGreaterThanOrEqual(2);

  // After that breath the stride opens up.
  await page.waitForTimeout(3000);
  const d = await snap(page);
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(2500);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(400);
  const e = await snap(page);
  const fast = Math.abs(e.pz - d.pz);
  expect(
    fast,
    `slow ${String(slow.toFixed(2))} then fast ${String(fast.toFixed(2))}`,
  ).toBeGreaterThan(slow * 1.6);
});
