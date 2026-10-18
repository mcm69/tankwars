import { expect, test } from '@playwright/test';

test('boots, renders the canvas and advances the sim', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

  await page.goto('/');
  const canvas = page.locator('canvas.game-canvas');
  await expect(canvas).toBeVisible();
  await expect(canvas).toHaveJSProperty('width', 640);
  await expect(canvas).toHaveJSProperty('height', 400);

  const ticks = () => page.evaluate(() => window.__tankwars?.ticks ?? 0);
  const first = await ticks();
  await expect.poll(ticks).toBeGreaterThan(first + 10);
  expect(errors).toEqual([]);
});
