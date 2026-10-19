import { expect, test } from '@playwright/test';
import { continueToNext, finishGame, phase, pressUntilScene, scene } from './helpers';

test('a two-game set, human vs computer, from title to final results via the UI', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await pressUntilScene(page, 'Enter', 'menu');

  // Games per set is the 13th row: move down and lower it from 10 to 2.
  for (let i = 0; i < 12; i++) await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowLeft');
  await expect
    .poll(() => page.evaluate(() => window.__tankwars!.app!.settings.gamesPerSet))
    .toBe(2);

  await page.keyboard.press('KeyS');
  await expect.poll(() => scene(page)).toBe('setup');
  // Rename player 1; player 2 is a computer by default.
  await page.keyboard.press('Enter');
  await page.keyboard.type('Tester');
  await page.keyboard.press('Enter');
  await expect
    .poll(() => page.evaluate(() => window.__tankwars!.app!.slots[0]!.name))
    .toBe('Tester');
  expect(await page.evaluate(() => window.__tankwars!.app!.slots[1]!.kind)).toBe('computer');

  await page.keyboard.press('KeyS');
  await expect.poll(() => scene(page)).toBe('battle');
  const names = await page.evaluate(() => window.__tankwars!.round!.tanks.map((t) => t.name));
  expect(names[0]).toBe('Tester');

  await finishGame(page);
  await continueToNext(page, 'battle');
  await finishGame(page);
  await continueToNext(page, 'final');
  await pressUntilScene(page, 'Enter', 'menu');
  expect(errors).toEqual([]);
});

test('quitting mid-game returns to the menu', async ({ page }) => {
  await page.goto('/?play&seed=4');
  await expect.poll(() => phase(page), { timeout: 15_000 }).toBe('aiming');
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('KeyY');
  await expect.poll(() => scene(page)).toBe('menu');
});

test('setup screen: mouse toggles type and personality', async ({ page }) => {
  await page.goto('/');
  await pressUntilScene(page, 'Enter', 'menu');
  await page.keyboard.press('KeyS');
  await expect.poll(() => scene(page)).toBe('setup');
  const box = (await page.locator('canvas.game-canvas').boundingBox())!;
  const click = (x: number, y: number) =>
    page.mouse.click(box.x + (x / 640) * box.width, box.y + (y / 400) * box.height);
  await click(285, 52 + 27 + 10); // row 2 type button: computer → human
  await expect
    .poll(() => page.evaluate(() => window.__tankwars!.app!.slots[1]!.kind))
    .toBe('human');
  await click(500, 52 + 27 + 10); // row 2 personality: switches back to computer, next AI
  await expect
    .poll(() => page.evaluate(() => window.__tankwars!.app!.slots[1]!.kind))
    .toBe('computer');
  expect(await page.evaluate(() => window.__tankwars!.app!.slots[1]!.ai)).not.toBe('stupid');
});
