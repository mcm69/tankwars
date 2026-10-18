import { expect, test, type Page } from '@playwright/test';

const phase = (page: Page) => page.evaluate(() => window.__tankwars?.phase);
const current = (page: Page) =>
  page.evaluate(() => {
    const t = window.__tankwars?.round?.current;
    return t && { id: t.id, angle: t.angle, power: t.power };
  });

test('a full round via the keyboard: aim, power, fire, round over, new round', async ({ page }) => {
  await page.goto('/?play&seed=2&wind=none&walls=off');
  await expect.poll(() => phase(page), { timeout: 15_000 }).toBe('aiming');
  const start = (await current(page))!;

  // Flip reverses facing.
  await page.keyboard.press('KeyI');
  await expect.poll(async () => (await current(page))!.angle).toBe(180 - start.angle);

  // PgUp/PgDn move power by 100; arrows (with Shift = no auto-repeat) by 1.
  await page.keyboard.press('PageUp');
  await expect.poll(async () => (await current(page))!.power).toBe(start.power + 100);
  await page.keyboard.press('Shift+ArrowUp');
  await expect.poll(async () => (await current(page))!.power).toBe(start.power + 101);
  for (let i = 0; i < 12; i++) await page.keyboard.press('PageDown');
  await expect.poll(async () => (await current(page))!.power).toBe(0);

  // Commands apply on the next sim tick, hence the polling above.
  // Point straight up: a zero-power shell falls back onto the shooter, who dies.
  const angle = (await current(page))!.angle;
  const key = angle < 90 ? 'Shift+ArrowLeft' : 'Shift+ArrowRight';
  for (let i = 0; i < Math.abs(90 - angle); i++) await page.keyboard.press(key);
  await expect.poll(async () => (await current(page))!.angle).toBe(90);
  await page.keyboard.press('Space');

  await expect.poll(() => phase(page), { timeout: 15_000 }).toBe('roundOver');
  const winner = await page.evaluate(() => window.__tankwars?.round?.winnerId);
  expect(winner).toBe(1 - start.id);

  // Any key → between-games status screen → any key → the next game.
  const scene = () => page.evaluate(() => window.__tankwars?.scene);
  await expect
    .poll(async () => {
      await page.keyboard.press('Enter');
      return scene();
    })
    .toBe('status');
  await expect
    .poll(async () => {
      await page.keyboard.press('Enter');
      return scene();
    })
    .toBe('battle');
  await expect.poll(() => phase(page), { timeout: 15_000 }).toMatch(/dropping|aiming/);
});
