import { expect, test, type Page } from '@playwright/test';

/** Clicks a point given in logical canvas coordinates. */
async function clickLogical(page: Page, x: number, y: number, button: 'left' | 'right' = 'left') {
  const box = (await page.locator('canvas.game-canvas').boundingBox())!;
  await page.mouse.click(box.x + (x / 640) * box.width, box.y + (y / 400) * box.height, { button });
}

const state = (page: Page) =>
  page.evaluate(() => {
    const w = window.__tankwars!;
    const t = w.round!.current;
    return {
      phase: w.phase,
      overlay: w.overlay,
      tick: w.round!.tickCount,
      angle: t?.angle,
      power: t?.power,
      selected: t?.selected,
      massKill: w.round!.massKillPending,
    };
  });

test.beforeEach(async ({ page }) => {
  await page.goto('/?play&seed=2&wind=none&walls=off&crumble=0');
  await expect.poll(async () => (await state(page)).phase, { timeout: 15_000 }).toBe('aiming');
});

test('HUD buttons: power, angle, weapon slot and FIRE', async ({ page }) => {
  const s0 = await state(page);
  await clickLogical(page, 30, 28); // "Power" label: +100
  await expect.poll(async () => (await state(page)).power).toBe(s0.power! + 100);
  await clickLogical(page, 30, 28, 'right'); // right-click: -100
  await expect.poll(async () => (await state(page)).power).toBe(s0.power);
  await clickLogical(page, 79, 10); // angle ◀: tilt left (+1)
  await expect.poll(async () => (await state(page)).angle).toBe(s0.angle! + 1);
  await clickLogical(page, 8 + 11 * 25 + 12, 50); // slot 11: hand grenade
  await expect.poll(async () => (await state(page)).selected).toBe(11);
  await page.keyboard.press('Tab');
  await expect.poll(async () => (await state(page)).selected).toBe(0); // wraps to lead ball
  await clickLogical(page, 596, 20); // FIRE
  await expect.poll(async () => (await state(page)).phase).not.toBe('aiming');
});

test('dragging on the field aims the current tank', async ({ page }) => {
  const t = await page.evaluate(() => {
    const c = window.__tankwars!.round!.current!;
    return { x: c.x, y: c.y };
  });
  const box = (await page.locator('canvas.game-canvas').boundingBox())!;
  const at = (fx: number, fy: number) =>
    [box.x + ((fx + 8) / 640) * box.width, box.y + ((fy + 72) / 400) * box.height] as const;
  const dir = t.x < 312 ? 1 : -1;
  await page.mouse.move(...at(t.x + dir * 20, t.y - 80));
  await page.mouse.down();
  await page.mouse.move(...at(t.x + dir * 60, t.y - 66), { steps: 4 });
  await page.mouse.up();
  // Pointing (60, 60) above the turret: 45° on that side.
  const expected = dir > 0 ? 45 : 135;
  await expect.poll(async () => (await state(page)).angle).toBe(expected);
});

test('overlays open, freeze the sim and close on any key', async ({ page }) => {
  await page.keyboard.press('Digit2');
  await expect.poll(async () => (await state(page)).overlay).toBe('status');
  const frozen = (await state(page)).tick;
  await page.waitForTimeout(300);
  expect((await state(page)).tick).toBe(frozen);
  await page.keyboard.press('KeyX');
  await expect.poll(async () => (await state(page)).overlay).toBeNull();
  await expect.poll(async () => (await state(page)).tick).toBeGreaterThan(frozen);

  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).overlay).toBe('pause');
  await clickLogical(page, 320, 200);
  await expect.poll(async () => (await state(page)).overlay).toBeNull();

  await page.keyboard.press('F1');
  await expect.poll(async () => (await state(page)).overlay).toBe('help');
  await page.keyboard.press('Escape');
  await expect.poll(async () => (await state(page)).overlay).toBeNull();
});

test('mass kill asks first, then ends the round after the turn', async ({ page }) => {
  await page.keyboard.press('KeyK');
  await expect.poll(async () => (await state(page)).overlay).toBe('confirm');
  await page.keyboard.press('KeyN');
  await expect.poll(async () => (await state(page)).overlay).toBeNull();
  expect((await state(page)).massKill).toBe(false);

  await page.keyboard.press('KeyK');
  await page.keyboard.press('KeyY');
  await expect.poll(async () => (await state(page)).massKill).toBe(true);
  await page.keyboard.press('Space');
  await expect.poll(async () => (await state(page)).phase, { timeout: 15_000 }).toBe('roundOver');
});
