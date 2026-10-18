import { expect, test } from '@playwright/test';
import { finishGame, phase, pressUntilScene, settle } from './helpers';

test('after a game, a human with money shops and the purchase carries into the next game', async ({
  page,
}) => {
  await page.goto('/?play&games=3&money=20000&seed=4&wind=none');
  await expect.poll(() => phase(page), { timeout: 15_000 }).toBe('aiming');

  await finishGame(page);
  await pressUntilScene(page, 'Enter', 'status');
  await pressUntilScene(page, 'Enter', 'shop');
  await settle(page);
  const before = await page.evaluate(() => window.__tankwars!.app!.set!.players[0]!.inventory[1]);

  // First row is the Incinerator: add one bundle, then Done (which buys it).
  await page.keyboard.press('Equal');
  await page.keyboard.press('KeyD');
  // Wait for the purchase, then leave player 2's shop (both players are human) without buying.
  await expect
    .poll(() => page.evaluate(() => window.__tankwars!.app!.set!.players[0]!.money))
    .toBe(20000 + 500 - 3000);
  await settle(page);
  await pressUntilScene(page, 'Escape', 'battle');

  const after = await page.evaluate(() => window.__tankwars!.round!.tanks[0]!.inventory[1]);
  expect(after).toBe(before! + 100);
});

test('H opens the guidance target picker; Enter arms it on the chosen tank', async ({ page }) => {
  await page.goto('/?play&arsenal&seed=4&wind=none&players=3');
  await expect.poll(() => phase(page), { timeout: 15_000 }).toBe('aiming');
  await page.keyboard.press('KeyH');
  await expect.poll(() => page.evaluate(() => window.__tankwars?.overlay)).toBe('target');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect.poll(() => page.evaluate(() => window.__tankwars?.overlay)).toBeNull();
  const g = await page.evaluate(() => window.__tankwars!.round!.current!.guidance);
  expect(g?.axis).toBe('H');
  // Pressing H again disarms it.
  await page.keyboard.press('KeyH');
  await expect
    .poll(() => page.evaluate(() => window.__tankwars!.round!.current!.guidance))
    .toBeNull();
});
