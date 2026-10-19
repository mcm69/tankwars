import { devices, expect, test, type Page } from '@playwright/test';
import { phase, scene } from './helpers';

// Emulate a phone in landscape in Chromium (touch + coarse pointer); drop the WebKit default.
const iphone: Partial<(typeof devices)[string]> = { ...devices['iPhone 13 landscape'] };
delete iphone.defaultBrowserType;
test.use(iphone);

/** Taps a point given in whole-canvas logical coordinates. */
async function tapCanvas(page: Page, x: number, y: number) {
  const box = (await page.locator('canvas.game-canvas').boundingBox())!;
  const width = await page.evaluate(() => document.querySelector('canvas')!.width);
  await page.touchscreen.tap(box.x + (x / width) * box.width, box.y + (y / 400) * box.height);
}

async function tapButton(page: Page, id: string) {
  const r = await page.evaluate((b) => window.__tankwars!.touchLayout![b]!, id);
  await tapCanvas(page, r.x + r.w / 2, r.y + r.h / 2);
}

/** Taps a point in core (640×400) coordinates. */
async function tapCore(page: Page, x: number, y: number) {
  const offset = await page.evaluate(() => window.__tankwars!.app!.screen.coreOffsetX);
  await tapCanvas(page, x + offset, y);
}

const current = (page: Page) =>
  page.evaluate(() => {
    const t = window.__tankwars!.round!.current!;
    return { power: t.power, angle: t.angle, selected: t.selected };
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/?play&arsenal&seed=4&wind=none&walls=off');
  await expect.poll(() => phase(page), { timeout: 15_000 }).toBe('aiming');
});

test('uses the wide touch layout with side panels', async ({ page }) => {
  const sw = await page.evaluate(() => window.__tankwars!.app!.screen.sideWidth);
  expect(sw).toBeGreaterThanOrEqual(80);
  expect(await page.evaluate(() => window.__tankwars!.touchLayout)).not.toBeNull();
});

test('side buttons: angle, power, weapon, fire', async ({ page }) => {
  const s0 = await current(page);
  await tapButton(page, 'angleLeft');
  await expect.poll(async () => (await current(page)).angle).toBe(Math.min(180, s0.angle + 1));
  await tapButton(page, 'powerUp');
  await expect.poll(async () => (await current(page)).power).toBe(s0.power + 1);
  await tapButton(page, 'weaponNext');
  await expect.poll(async () => (await current(page)).selected).not.toBe(s0.selected);
  await tapButton(page, 'fire');
  await expect.poll(() => phase(page)).not.toBe('aiming');
});

test('holding a power button repeats and accelerates', async ({ page }) => {
  const s0 = await current(page);
  const r = await page.evaluate(() => window.__tankwars!.touchLayout!.powerDown!);
  const box = (await page.locator('canvas.game-canvas').boundingBox())!;
  const width = await page.evaluate(() => document.querySelector('canvas')!.width);
  // Dispatch a held touch via pointer events (Playwright's touchscreen only taps).
  await page.evaluate(
    ({ x, y }) => {
      const c = document.querySelector('canvas')!;
      c.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: x,
          clientY: y,
          pointerId: 7,
          pointerType: 'touch',
          bubbles: true,
        }),
      );
    },
    {
      x: box.x + ((r.x + r.w / 2) / width) * box.width,
      y: box.y + ((r.y + r.h / 2) / 400) * box.height,
    },
  );
  await page.waitForTimeout(1200);
  await page.evaluate(() =>
    document
      .querySelector('canvas')!
      .dispatchEvent(
        new PointerEvent('pointerup', { pointerId: 7, pointerType: 'touch', bubbles: true }),
      ),
  );
  expect((await current(page)).power).toBeLessThan(s0.power - 40);
});

test('pause panel buttons reach quit (no keyboard needed)', async ({ page }) => {
  await tapButton(page, 'pause');
  await expect.poll(() => page.evaluate(() => window.__tankwars?.overlay)).toBe('pause');
  // Quit is the 4th button; its rect comes from the same layout the overlay draws.
  const quit = await page.evaluate(() => {
    const field = { x: 8, y: 72, w: 624, h: 320 };
    const left = Math.round(field.x + (field.w - 340) / 2) + 10;
    const w = (340 - 20 - 18) / 4;
    return {
      x: left + 3 * (w + 6) + w / 2,
      y: Math.round(field.y + (field.h - 206) / 2) + 206 - 46 + 12,
    };
  });
  await tapCore(page, quit.x, quit.y);
  await expect.poll(() => page.evaluate(() => window.__tankwars?.overlay)).toBe('confirm');
  await tapCore(page, 320 - 80 + 35, 232 + 18 + 10); // Yes
  await expect.poll(() => scene(page)).toBe('menu');
});

test('setup: tapping a name opens the keyboard field', async ({ page }) => {
  await page.goto('/');
  await tapCanvas(page, 400, 200);
  await expect.poll(() => scene(page)).toBe('menu');
  await page.waitForTimeout(300);
  // Start is the last menu row (19 rows of 17 px from y = 44).
  await tapCore(page, 320, 44 + 18 * 17 + 8);
  await expect.poll(() => scene(page)).toBe('setup');
  await tapCore(page, 120, 52 + 10);
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.className))
    .toBe('text-entry');
  await page.keyboard.type('Thumbs');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.__tankwars!.app!.slots[0]!.name))
    .toBe('Thumbs');
});

test('portrait shows the rotate prompt and pauses the game', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.rotate-prompt')).toBeVisible();
  const t0 = await page.evaluate(() => window.__tankwars!.ticks);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__tankwars!.ticks)).toBe(t0);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.locator('.rotate-prompt')).toBeHidden();
  await expect.poll(() => page.evaluate(() => window.__tankwars!.ticks)).toBeGreaterThan(t0);
});
