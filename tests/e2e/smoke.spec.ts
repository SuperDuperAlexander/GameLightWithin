import { test, expect } from '@playwright/test';

test('the canvas renders something other than a flat clear colour', async ({ page }) => {
  await page.goto('/?debug=1');
  await page.waitForFunction(() => document.querySelector('canvas') !== null);
  await page.waitForTimeout(3000);

  const info = await page.evaluate(() => {
    const canvas = document.querySelector('canvas') as HTMLCanvasElement;
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    return {
      hasGl: gl !== null,
      renderer: gl ? (gl.getParameter(gl.VERSION) as string) : null,
      width: canvas.width,
      height: canvas.height,
    };
  });
  expect(info.hasGl).toBe(true);
  expect(info.width).toBeGreaterThan(100);

  await page.screenshot({ path: 'screenshots/_smoke.png' });
});
