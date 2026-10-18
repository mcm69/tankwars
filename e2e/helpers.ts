import { expect, type Page } from '@playwright/test';

export const scene = (page: Page) => page.evaluate(() => window.__tankwars?.scene);
export const phase = (page: Page) => page.evaluate(() => window.__tankwars?.phase);

/**
 * Presses `key` until the scene is `target` (screens ignore keys for a moment after opening).
 * Checks before each press, so it never skips past the target.
 */
export async function pressUntilScene(page: Page, key: string, target: string) {
  await expect
    .poll(
      async () => {
        if ((await scene(page)) !== target) await page.keyboard.press(key);
        return scene(page);
      },
      { timeout: 15_000 },
    )
    .toBe(target);
}

/**
 * From the end of a game to the next one (or the final results): continues past the round-over
 * banner and status screen, and leaves any shop visits without buying.
 */
export async function continueToNext(page: Page, target: 'battle' | 'final' = 'battle') {
  await expect
    .poll(
      async () => {
        const s = await scene(page);
        if (s === target && (target !== 'battle' || (await phase(page)) !== 'roundOver')) return s;
        await page.keyboard.press(s === 'shop' ? 'Escape' : 'Enter');
        return 'waiting';
      },
      { timeout: 20_000 },
    )
    .toBe(target);
}

/** Ends the current game through the UI: mass kill (K, Y), then fire until it's over. */
export async function finishGame(page: Page) {
  await expect.poll(() => phase(page), { timeout: 15_000 }).toMatch(/aiming|roundOver/);
  await page.keyboard.press('KeyK');
  await page.keyboard.press('KeyY');
  await expect
    .poll(
      async () => {
        if ((await scene(page)) !== 'battle') return 'over';
        if ((await phase(page)) === 'roundOver') return 'over';
        await page.keyboard.press('Space'); // the human fires; a computer fires by itself
        return 'playing';
      },
      { timeout: 30_000 },
    )
    .toBe('over');
}

/** Waits until the current scene has been up long enough to accept input. */
export async function settle(page: Page) {
  await page.waitForTimeout(350);
}
