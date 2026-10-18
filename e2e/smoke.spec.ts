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

test('F2 toggles the options panel', async ({ page }) => {
  await page.goto('/');
  const panel = page.locator('form.dev-options');
  await expect(panel).toBeHidden();
  await page.keyboard.press('F2');
  await expect(panel).toBeVisible();
  await page.keyboard.press('F2');
  await expect(panel).toBeHidden();
});
