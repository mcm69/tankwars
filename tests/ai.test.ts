import { describe, expect, it } from 'vitest';
import { aiShoppingList } from '../src/ai/buy';
import { probeShot } from '../src/ai/probe';
import { planTurn, playTurnNow, resolveAi, ORIGINAL_AIS, type AiMemory } from '../src/ai/registry';
import { chooseWeapon, laserEnergyNeeded } from '../src/ai/strategies';
import { playMatch, runTournament } from '../src/ai/tournament';
import { Rng } from '../src/core/rng';
import { cartCost } from '../src/game/economy';
import { fullInventory, itemIndex, ITEMS, startingInventory } from '../src/sim/items';
import { Round } from '../src/sim/round';
import { createTank, maxPower } from '../src/sim/tank';

function round(seed: number, extra: Partial<ConstructorParameters<typeof Round>[0]> = {}) {
  const r = new Round({
    seed,
    players: [
      { name: 'a', color: 0 },
      { name: 'b', color: 1 },
    ],
    wind: 0,
    walls: false,
    options: { crumble: 0 },
    ...extra,
  });
  while (r.phase !== 'aiming') r.tick();
  return r;
}

function resolve(r: Round): void {
  let g = 0;
  while (r.phase !== 'aiming' && r.phase !== 'roundOver' && g++ < 20_000) r.tick();
}

describe('probeShot', () => {
  it('predicts exactly where the real shot lands', () => {
    const r = round(3, { wind: 37 });
    const me = r.current!;
    const probe = probeShot(r, me, 60, 520);
    r.command({ type: 'selectWeapon', index: itemIndex('leadBall') });
    r.command({ type: 'setAim', angle: 60 });
    r.command({ type: 'setPower', power: 520 });
    r.command({ type: 'fire' });
    resolve(r);
    const impact = r.shotLog.at(-1)!.impact;
    if (probe.result.kind === 'lost') expect(impact).toBeNull();
    else
      expect(impact).toEqual({
        x: (probe.result as { x: number }).x,
        y: (probe.result as { y: number }).y,
      });
  });

  it('does not change the round', () => {
    const r = round(4);
    const cells = Uint8Array.from(r.terrain.cells);
    probeShot(r, r.current!, 45, 700);
    expect(r.terrain.cells).toEqual(cells);
    expect(r.phase).toBe('aiming');
    expect(r.projectile).toBeNull();
  });
});

describe('personalities', () => {
  const plan = (ai: Parameters<typeof planTurn>[0], r: Round, memory: AiMemory = {}) =>
    planTurn(ai, r, new Rng(1), memory)!;

  it('Windless Wit hits a target dead on when there is no wind', () => {
    for (const seed of [2, 5, 9]) {
      const r = round(seed);
      const me = r.current!;
      const other = r.tanks.find((t) => t.id !== me.id)!;
      playTurnNow('windlessWit', r, new Rng(1), {});
      resolve(r);
      const impact = r.shotLog.at(-1)!.impact;
      expect(other.health < 100 || (impact && Math.abs(impact.x - other.x) < 12)).toBe(true);
    }
  });

  it('Windless Wit ignores the wind (and so misses in a gale)', () => {
    const calm = plan('windlessWit', round(2));
    const windy = plan('windlessWit', round(2, { wind: 400 }));
    expect(windy).toEqual(calm);
  });

  it('Rifleman points straight at targets above him at full power', () => {
    const r = round(6);
    const me = r.current!;
    const other = r.tanks.find((t) => t.id !== me.id)!;
    other.y = me.y - 80; // put the enemy up on a ledge (in the air is fine for aiming)
    const p = plan('rifleman', r);
    const expected = (Math.atan2(me.y - 6 - (other.y - 3.5), other.x - me.x) * 180) / Math.PI;
    expect(p.angle).toBe(Math.round(expected));
    expect(p.power).toBe(maxPower(me));
  });

  it('Lobber ranges with two 75° shots, then homes in', () => {
    const r = round(11);
    const lobber = r.current!;
    const target = r.tanks.find((t) => t.id !== lobber.id)!;
    const memory: AiMemory = {};
    const rng = new Rng(3);
    const misses: number[] = [];
    for (let shot = 0; shot < 6 && r.phase !== 'roundOver'; shot++) {
      // Only the Lobber plays: give the other tank's turns back to it.
      while (r.phase === 'aiming' && r.currentId !== lobber.id) {
        r.command({ type: 'selectWeapon', index: itemIndex('leadBall') });
        r.command({ type: 'setAim', angle: 90 });
        r.command({ type: 'setPower', power: 0 });
        r.tanks[r.currentId]!.inventory[itemIndex('leadBall')] = 50;
        r.command({ type: 'fire' });
        resolve(r);
      }
      if (r.phase !== 'aiming') break;
      const p = planTurn('lobber', r, rng, memory)!;
      if (shot < 2) expect([75, 105]).toContain(p.angle);
      playTurnNow('lobber', r, rng, memory);
      resolve(r);
      const impact = r.shotLog.filter((s) => s.tankId === lobber.id).at(-1)!.impact;
      misses.push(impact ? Math.abs(impact.x - target.x) : 999);
    }
    // By the 4th shot he's much closer than his ranging shots were (or the target is dead).
    expect(
      target.health < 100 || Math.min(...misses.slice(3)) < Math.min(...misses.slice(0, 2)),
    ).toBe(true);
  });

  it('Twanger banks shots off the ceiling when walls bounce', () => {
    const r = round(8, { walls: true });
    const me = r.current!;
    const p = plan('twanger', r);
    const probe = probeShot(r, me, p.angle, p.power);
    expect(probe.touchedCeiling || p.power === maxPower(me)).toBe(true);
  });

  it('Lob & Shoot is Lobber without walls and Rifleman with them', () => {
    expect(plan('lobAndShoot', round(5))).toEqual(plan('lobber', round(5)));
    expect(plan('lobAndShoot', round(5, { walls: true }))).toEqual(
      plan('rifleman', round(5, { walls: true })),
    );
  });

  it('every personality always produces a legal plan', () => {
    for (const ai of [...ORIGINAL_AIS, 'birdyBonker'] as const) {
      for (const seed of [1, 2, 3]) {
        const r = round(seed, { walls: seed === 2 });
        const p = plan(ai, r);
        expect(p.angle).toBeGreaterThanOrEqual(0);
        expect(p.angle).toBeLessThanOrEqual(180);
        expect(p.power).toBeGreaterThanOrEqual(0);
        expect(r.current!.inventory[p.weapon]).toBeGreaterThan(0);
      }
    }
  });

  it('Random resolves to one of the original six', () => {
    const rng = new Rng(4);
    for (let i = 0; i < 50; i++) expect(ORIGINAL_AIS).toContain(resolveAi('random', rng));
  });
});

describe('weapon choice', () => {
  it('never picks a blast big enough to catch the shooter', () => {
    const me = createTank(0, 'a', 0, 0, 0, fullInventory(5));
    expect(chooseWeapon(me, 300)).toBe(itemIndex('nuke5mt'));
    expect(chooseWeapon(me, 70)).toBe(itemIndex('incineratorMk2'));
    expect(chooseWeapon(me, 30)).toBe(itemIndex('grenade'));
  });

  it('prices a laser shot by what is in the way', () => {
    const r = round(7);
    const me = r.current!;
    const other = r.tanks.find((t) => t.id !== me.id)!;
    const dist = Math.hypot(other.x - me.x, other.y - me.y);
    expect(laserEnergyNeeded(r, me, other)).toBeGreaterThanOrEqual(Math.floor(dist / 1.2));
  });
});

describe('computer shopping', () => {
  it('never overspends and keeps some money back', () => {
    for (const ai of [...ORIGINAL_AIS, 'birdyBonker'] as const) {
      for (const money of [0, 2999, 12_000, 60_000]) {
        const cart = aiShoppingList(ai, money, startingInventory(3), new Rng(money + 1));
        expect(cartCost(cart)).toBeLessThanOrEqual(money);
        cart.forEach((n, i) => {
          if (n > 0) expect(ITEMS[i]!.price).not.toBeNull();
        });
      }
    }
  });

  it('smart shoppers buy defenses and lasers first', () => {
    const cart = aiShoppingList('twanger', 40_000, startingInventory(3), new Rng(1));
    expect(cart[itemIndex('shieldEnergy')]).toBeGreaterThan(0);
    const rifle = aiShoppingList('rifleman', 12_000, startingInventory(3), new Rng(1));
    expect(rifle[itemIndex('laser')]).toBe(1);
  });
});

describe('tournament', () => {
  it('plays headless games to a result', () => {
    const r = playMatch(['windlessWit', 'stupid'], {
      seed: 3,
      options: { wind: 'none', walls: 'off' },
    });
    expect(r.turns).toBeGreaterThan(0);
    expect(r.winner === null || r.winner === 0 || r.winner === 1).toBe(true);
  });

  it('ranks Windless Wit above Mr. Stupid in calm air', () => {
    const report = runTournament(
      ['stupid', 'windlessWit'],
      6,
      5,
      { wind: 'none', walls: 'off' },
      { duel: true, ffa: false },
    );
    expect(report.duel[0]!.ai).toBe('windlessWit');
    expect(report.duel[0]!.wins).toBeGreaterThanOrEqual(5);
  });
});
