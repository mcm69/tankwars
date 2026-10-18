import { expect, test } from '@playwright/test';
import { phase } from './helpers';

const played = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__tankwars!.app!.audio.played);

test('sounds play after a gesture, and S mutes them', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?play&seed=3&wind=none');
  await expect.poll(() => phase(page), { timeout: 15_000 }).toBe('aiming');

  // The first key press unlocks audio; then a shot makes sound.
  await page.keyboard.press('ArrowUp');
  const before = await played(page);
  await page.keyboard.press('Space');
  await expect.poll(() => played(page), { timeout: 10_000 }).toBeGreaterThan(before);
  const state = await page.evaluate(
    () =>
      (window.__tankwars!.app!.audio as unknown as { out: { ctx: AudioContext | null } }).out.ctx
        ?.state,
  );
  expect(state).toBe('running');

  // Mute with S: further events stay silent.
  await page.keyboard.press('KeyS');
  await expect.poll(() => page.evaluate(() => window.__tankwars!.app!.settings.sound)).toBe(false);
  await expect.poll(() => phase(page), { timeout: 15_000 }).toMatch(/aiming|roundOver/);
  const muted = await played(page);
  await page.keyboard.press('Space');
  await page.waitForTimeout(1500);
  expect(await played(page)).toBe(muted);
  expect(errors).toEqual([]);
});
