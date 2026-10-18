import { expect, test } from '@playwright/test';

// Logical coordinates (see LAYOUT in src/config.ts): a point near the bottom of the field,
// which is always solid ground after generation.
const PROBE = { x: 8 + 312, y: 72 + 300 };

test('clicking the field carves terrain', async ({ page }) => {
  await page.goto('/?lab&seed=1991');
  const canvas = page.locator('canvas.game-canvas');
  await expect(canvas).toBeVisible();

  const pixel = () =>
    page.evaluate(({ x, y }) => {
      const c = document.querySelector<HTMLCanvasElement>('canvas.game-canvas')!;
      return Array.from(c.getContext('2d')!.getImageData(x, y, 1, 1).data);
    }, PROBE);

  await expect.poll(() => page.evaluate(() => window.__tankwars?.ticks ?? 0)).toBeGreaterThan(2);
  const before = await pixel();

  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + (PROBE.x / 640) * box.width, box.y + (PROBE.y / 400) * box.height);

  await expect.poll(pixel).not.toEqual(before);
});
