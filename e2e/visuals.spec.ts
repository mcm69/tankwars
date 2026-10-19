import { expect, test } from '@playwright/test';
import { phase } from './helpers';

const visuals = (page: import('@playwright/test').Page) =>
  page.evaluate(() => window.__tankwars!.visuals);

test('backgrounds animate, and every one renders without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const bg of ['none', 'stars', 'bars', 'circles', 'spreading', 'blue']) {
    await page.goto(`/?play&seed=5&bg=${bg}&bgspeed=6`);
    await expect.poll(() => phase(page)).toMatch(/dropping|aiming/);
    expect(await visuals(page)).toMatchObject({ background: bg, backgroundSpeed: 6 });
  }
  expect(errors).toEqual([]);
});

test('reduced motion stills the sky and stops shaking', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?play&seed=5&bg=circles');
  await expect.poll(() => phase(page)).toMatch(/dropping|aiming/);
  expect(await visuals(page)).toMatchObject({
    background: 'circles',
    backgroundSpeed: 0,
    reducedMotion: true,
    shakeEnabled: false,
  });

  // Forcing full motion in the settings overrides the system preference.
  await page.evaluate(() => {
    const app = window.__tankwars!.app!;
    app.settings = { ...app.settings, motion: 'full' };
  });
  await expect
    .poll(() => visuals(page))
    .toMatchObject({ reducedMotion: false, shakeEnabled: true });
  expect((await visuals(page))!.backgroundSpeed).toBeGreaterThan(0);
});
