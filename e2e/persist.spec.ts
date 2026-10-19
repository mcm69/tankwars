import { expect, test } from '@playwright/test';
import { continueToNext, finishGame, phase, pressUntilScene, scene } from './helpers';

test('settings survive a reload', async ({ page }) => {
  await page.goto('/');
  await pressUntilScene(page, 'Enter', 'menu');
  await page.keyboard.press('KeyO');
  await expect.poll(() => scene(page)).toBe('options');
  for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowDown'); // Volume
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => window.__tankwars!.app!.settings.volume)).toBe(5);
  await page.reload();
  expect(await page.evaluate(() => window.__tankwars!.app!.settings.volume)).toBe(5);
});

test('reloading mid-set resumes at the same game with the same standings', async ({ page }) => {
  await page.goto('/');
  await pressUntilScene(page, 'Enter', 'menu');
  // Games per set (3rd row) down to 3, then start with the default human vs computer.
  for (let i = 0; i < 2; i++) await page.keyboard.press('ArrowDown');
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('KeyS');
  await expect.poll(() => scene(page)).toBe('setup');
  await page.keyboard.press('KeyS');
  await expect.poll(() => scene(page)).toBe('battle');

  await finishGame(page);
  await continueToNext(page, 'battle'); // game 2 starts (and is saved)
  await expect.poll(() => phase(page), { timeout: 15_000 }).toMatch(/dropping|aiming/);
  const before = await page.evaluate(() => {
    const set = window.__tankwars!.app!.set!;
    return {
      played: set.roundsPlayed,
      players: set.players.map((p) => [p.name, p.score, p.money]),
      wind: window.__tankwars!.round!.wind,
    };
  });

  await page.reload();
  await pressUntilScene(page, 'Enter', 'menu');
  // The first menu row is now "Resume game 2 of 3".
  await page.keyboard.press('Enter');
  await expect.poll(() => scene(page)).toBe('battle');
  const after = await page.evaluate(() => {
    const set = window.__tankwars!.app!.set!;
    return {
      played: set.roundsPlayed,
      players: set.players.map((p) => [p.name, p.score, p.money]),
      wind: window.__tankwars!.round!.wind,
    };
  });
  expect(after).toEqual(before);

  // Quitting forgets the saved set.
  await expect.poll(() => phase(page), { timeout: 15_000 }).toBe('aiming');
  await page.keyboard.press('KeyQ');
  await page.keyboard.press('KeyY');
  await expect.poll(() => scene(page)).toBe('menu');
  expect(await page.evaluate(() => window.__tankwars!.app!.savedSet)).toBeNull();
});
