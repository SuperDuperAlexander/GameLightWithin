import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { call, snap, waitForSnap } from './helpers';

/**
 * Walking with the real keys.
 *
 * The full play-through steers the player with the auto-walk helper, which
 * sets a world direction straight away. That never touches the camera-relative
 * part of the movement, which is where A and D were swapped. These press the
 * keys the way a player does.
 */
test.describe('walking with the keyboard', () => {
  const TOLERANCE = 0.7;

  /** Holds a key for a moment and reports how far the player moved. */
  async function press(page: Page, key: string): Promise<{ dx: number; dz: number }> {
    const before = await snap(page);
    await page.keyboard.down(key);
    // Long enough to be unambiguous even at a few frames a second.
    await page.waitForTimeout(2000);
    await page.keyboard.up(key);
    await page.waitForTimeout(400);
    const after = await snap(page);
    const moved = { dx: after.px - before.px, dz: after.pz - before.pz };
    // eslint-disable-next-line no-console
    console.log(`MOVE ${key} dx=${moved.dx.toFixed(2)} dz=${moved.dz.toFixed(2)}`);
    return moved;
  }

  test.beforeEach(async ({ page }) => {
    await page.goto('/?scene=3&quality=low&nopaint=1');
    await page.waitForFunction(() => document.body.dataset.ready === '1');
    // Wait for the renderer to actually be running. The first frames compile
    // shaders and build the environment map, which on a machine with no
    // graphics card takes seconds. A fixed pause raced that and made these
    // tests read a player who had not moved yet because time had not moved.
    await waitForSnap(page, (s) => s.fps > 0, 'the first frames', 90_000);
    // Face straight down the valley, which runs toward negative z.
    await call(page, 'lookAt', Math.PI, 0.12);
    await page.waitForTimeout(1200);
  });

  test('W walks the way the camera looks', async ({ page }) => {
    const { dz } = await press(page, 'KeyW');
    expect(dz, 'W should walk toward negative z').toBeLessThan(-TOLERANCE);
  });

  test('S walks back', async ({ page }) => {
    const { dz } = await press(page, 'KeyS');
    expect(dz, 'S should walk toward positive z').toBeGreaterThan(TOLERANCE);
  });

  test('D walks right, not left', async ({ page }) => {
    const { dx } = await press(page, 'KeyD');
    expect(dx, 'facing negative z, right is positive x').toBeGreaterThan(TOLERANCE);
  });

  test('A walks left, not right', async ({ page }) => {
    const { dx } = await press(page, 'KeyA');
    expect(dx, 'facing negative z, left is negative x').toBeLessThan(-TOLERANCE);
  });

  test('the arrow keys do the same as WASD', async ({ page }) => {
    const right = await press(page, 'ArrowRight');
    expect(right.dx).toBeGreaterThan(TOLERANCE);
    const left = await press(page, 'ArrowLeft');
    expect(left.dx).toBeLessThan(-TOLERANCE);
  });

  test('walking resets the breath in progress', async ({ page }) => {
    // Each wait has to cover several frames, and a machine with no graphics
    // card runs this at a couple of frames a second.
    await page.keyboard.down('Space');
    await page.waitForTimeout(2000);
    expect((await snap(page)).breathPhase).toBe('inhale');
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(2000);
    expect((await snap(page)).breathPhase).toBe('idle');
    await page.keyboard.up('KeyW');
    await page.keyboard.up('Space');
  });
});
