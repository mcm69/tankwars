import { expect, test, type Page } from '@playwright/test';

const phase = (page: Page) => page.evaluate(() => window.__tankwars?.phase);

test('?arsenal arms every weapon; a CRI and a laser both resolve into the next turn', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/?seed=3&arsenal&wind=none&walls=off');
  await expect.poll(() => phase(page), { timeout: 15_000 }).toBe('aiming');
  const owned = await page.evaluate(
    () => window.__tankwars!.round!.current!.inventory.slice(0, 18).filter((n) => n > 0).length,
  );
  expect(owned).toBe(18);

  // CRI 20/D (slot 10) straight down next to the shooter.
  // Status then Esc then Space in quick succession (possibly one tick): Esc must only close
  // the overlay, and the Space press after it must still fire.
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const r = window.__tankwars!.round!;
    r.command({ type: 'selectWeapon', index: 10 });
    r.command({ type: 'setPower', power: 150 });
  });
  await page.keyboard.press('Space');
  await expect.poll(() => phase(page)).toBe('effects');
  await expect.poll(() => phase(page), { timeout: 20_000 }).toMatch(/aiming|roundOver/);

  if ((await phase(page)) === 'aiming') {
    await page.evaluate(() => {
      const r = window.__tankwars!.round!;
      r.command({ type: 'selectWeapon', index: 5 }); // laser
      r.command({ type: 'setPower', power: 600 });
    });
    await page.keyboard.press('Space');
    await expect.poll(() => phase(page), { timeout: 20_000 }).toMatch(/aiming|roundOver/);
  }
  expect(errors).toEqual([]);
});
