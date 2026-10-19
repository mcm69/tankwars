import { expect, test } from '@playwright/test';
import type { DebugState } from '../src/debug/debug-state';
import { replayRound } from '../src/sim/replay';
import { phase } from './helpers';

test('debug state from a real game replays to the same state headlessly', async ({ page }) => {
  // All computers at triple speed, so plenty happens quickly.
  await page.goto('/?play&seed=21&players=3&cpu=3&walls=on&crumble=100');
  await expect
    .poll(() => page.evaluate(() => window.__tankwars!.round?.shotLog.length ?? 0), {
      timeout: 20_000,
    })
    .toBeGreaterThanOrEqual(4);
  const { state, tanks } = await page.evaluate(() => {
    const tw = window.__tankwars!;
    return {
      state: tw.debugState(),
      tanks: tw.round!.tanks.map((t) => [t.x, t.y, t.health, t.alive, t.angle, t.power]),
    };
  });
  expect(state.round!.commandLog.length).toBeGreaterThan(0);
  const round = replayRound(state.round!.config, state.round!.commandLog, state.round!.tickCount);
  expect(round.tanks.map((t) => [t.x, t.y, t.health, t.alive, t.angle, t.power])).toEqual(tanks);
});

test('F9 copies the debug state', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?play&seed=5');
  await expect.poll(() => phase(page)).toMatch(/dropping|aiming/);
  await page.keyboard.press('F9');
  await expect
    .poll(async () => {
      const text = await page.evaluate(() => navigator.clipboard.readText());
      try {
        return (JSON.parse(text) as DebugState).round !== null;
      } catch {
        return false;
      }
    })
    .toBe(true);
});

test('a crash stops the game and shows the error panel with debug info', async ({ page }) => {
  await page.goto('/?play&seed=5');
  await expect.poll(() => phase(page)).toMatch(/dropping|aiming/);
  await page.evaluate(() => {
    window.__tankwars!.app!.currentScene.update = () => {
      throw new Error('test explosion');
    };
  });
  const panel = page.locator('.error-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('test explosion');
  await expect(panel.getByRole('button', { name: 'Copy debug info' })).toBeVisible();
  const ticks = await page.evaluate(() => window.__tankwars!.ticks);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__tankwars!.ticks)).toBe(ticks); // stopped
  const info = await panel.locator('textarea').inputValue();
  expect((JSON.parse(info) as DebugState).error!.message).toBe('test explosion');
});
