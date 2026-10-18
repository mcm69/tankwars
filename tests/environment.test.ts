import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { Crumbler, hasLooseDirt } from '../src/sim/crumble';
import { resolveWalls, resolveWindLevel, rollWind, WIND_LEVELS } from '../src/sim/options';
import { launch, stepProjectile, type PhysicsWorld } from '../src/sim/physics';
import { fallDamage, Round } from '../src/sim/round';
import { createTank, isSupported } from '../src/sim/tank';
import { Material, Terrain } from '../src/sim/terrain';

const players = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, color: i }));
const winds = (level: (typeof WIND_LEVELS)[number], n = 2000) => {
  const rng = new Rng(77);
  return Array.from({ length: n }, () => Math.abs(rollWind(rng, level)));
};

describe('wind levels', () => {
  it('none is always calm', () => {
    expect(Math.max(...winds('none'))).toBe(0);
  });

  it('low stays gentle', () => {
    expect(Math.max(...winds('low'))).toBeLessThanOrEqual(30);
  });

  it('standard is usually under 100 with occasional gusts up to 800', () => {
    const w = winds('standard');
    expect(w.filter((v) => v <= 100).length / w.length).toBeGreaterThan(0.9);
    expect(Math.max(...w)).toBeGreaterThan(100);
    expect(Math.max(...w)).toBeLessThanOrEqual(800);
  });

  it('levels get progressively windier', () => {
    const median = (level: (typeof WIND_LEVELS)[number]) =>
      [...winds(level)].sort((a, b) => a - b)[1000]!;
    expect(median('low')).toBeLessThan(median('standard'));
    expect(median('standard')).toBeLessThan(median('high'));
    expect(median('high')).toBeLessThan(median('gale'));
    expect(Math.max(...winds('gale'))).toBeGreaterThan(10_000);
  });

  it('blows both ways', () => {
    const rng = new Rng(1);
    const signs = new Set(Array.from({ length: 200 }, () => Math.sign(rollWind(rng, 'standard'))));
    expect(signs.has(1) && signs.has(-1)).toBe(true);
  });

  it('random resolves to a concrete level, and random walls to both outcomes', () => {
    const rng = new Rng(3);
    const levels = new Set(Array.from({ length: 200 }, () => resolveWindLevel(rng, 'random')));
    expect([...levels].sort()).toEqual([...WIND_LEVELS].sort());
    const walls = new Set(Array.from({ length: 50 }, () => resolveWalls(rng, 'random')));
    expect(walls).toEqual(new Set([true, false]));
    expect(resolveWalls(rng, 'on')).toBe(true);
    expect(resolveWalls(rng, 'off')).toBe(false);
  });
});

describe('walls', () => {
  const fly = (world: PhysicsWorld, angle: number, power: number, x = 50, y = 280) => {
    const tank = createTank(0, 'a', 0, x, y);
    tank.angle = angle;
    tank.power = power;
    const p = launch(tank);
    const path: { x: number; y: number }[] = [];
    let r = stepProjectile(p, world);
    while (r.kind === 'flying') {
      path.push({ x: p.x, y: p.y });
      r = stepProjectile(p, world);
    }
    return { r, path, age: p.age };
  };

  it('on: shots bounce and never leave the field', () => {
    const terrain = new Terrain(300, 300);
    const { r, path } = fly({ terrain, tanks: [], wind: 400, walls: true }, 80, 1000);
    expect(r.kind).toBe('hitTerrain');
    for (const pt of path) {
      expect(pt.x).toBeGreaterThanOrEqual(0);
      expect(pt.x).toBeLessThan(300);
      expect(pt.y).toBeGreaterThanOrEqual(0);
    }
    // It really did reach the ceiling at full power.
    expect(Math.min(...path.map((p) => p.y))).toBeLessThan(10);
  });

  it('off: a shot leaving with no wind to return is dropped at once', () => {
    const terrain = new Terrain(300, 300);
    const { r, path } = fly({ terrain, tanks: [], wind: 0, walls: false }, 10, 1000, 250);
    expect(r.kind).toBe('lost');
    expect(path.filter((p) => p.x >= 300)).toHaveLength(0);
  });

  it('off: wind can bring a shot back onto the field', () => {
    const terrain = new Terrain(300, 300);
    terrain.fillFromSurface(new Array(300).fill(295));
    const { r, path } = fly({ terrain, tanks: [], wind: -300, walls: false }, 60, 600, 250);
    expect(path.some((p) => p.x >= 300)).toBe(true);
    expect(r.kind).toBe('hitTerrain');
    if (r.kind === 'hitTerrain') expect(r.x).toBeLessThan(300);
  });
});

describe('crumbling', () => {
  /** Flat ground with a cave dug underneath, leaving a floating roof. */
  const cave = () => {
    const t = new Terrain(60, 60);
    t.fillFromSurface(new Array(60).fill(20));
    for (let x = 20; x < 40; x++) for (let y = 30; y < 45; y++) t.set(x, y, Material.Air);
    return t;
  };

  it('detects loose dirt', () => {
    const t = new Terrain(10, 10);
    t.fillFromSurface(new Array(10).fill(5));
    expect(hasLooseDirt(t)).toBe(false);
    expect(hasLooseDirt(cave())).toBe(true);
  });

  it('collapses loose dirt one pixel per pass, conserving material', () => {
    const t = cave();
    const before = t.cells.reduce((n, c) => n + c, 0);
    const c = new Crumbler(t);
    const roofTop = t.surfaceY(30);
    expect(c.pass()).toBe(true);
    expect(t.surfaceY(30)).toBe(roofTop + 1);
    c.settleAll();
    expect(hasLooseDirt(t)).toBe(false);
    expect(t.cells.reduce((n, c2) => n + c2, 0)).toBe(before);
    expect(t.surfaceY(30)).toBe(20 + 15);
    expect(t.surfaceY(10)).toBe(20);
  });

  /** Plays one shot from a round that lands under-cut terrain, then returns the round. */
  const roundAfterShot = (crumble: number) => {
    const round = new Round({ seed: 5, players: players(2), options: { crumble }, wind: 0 });
    while (round.phase !== 'aiming') round.tick();
    // Dig a cave under some ground away from the tanks, then fire a harmless shot.
    const xs = round.tanks.map((t) => t.x);
    const cx = Math.round((xs[0]! + xs[1]!) / 2);
    const top = round.terrain.surfaceY(cx);
    for (let x = cx - 6; x <= cx + 6; x++) {
      for (let y = top + 6; y < top + 20; y++) round.terrain.set(x, y, Material.Air);
    }
    const t = round.current!;
    round.command({ type: 'power', delta: -10_000 });
    round.command({ type: 'aim', delta: (t.x < 300 ? 0 : 180) - t.angle });
    round.command({ type: 'fire' });
    let guard = 0;
    while (round.phase !== 'aiming' && round.phase !== 'roundOver' && guard++ < 10_000) {
      round.tick();
    }
    return round;
  };

  it('0% never moves loose ground', () => {
    expect(hasLooseDirt(roundAfterShot(0).terrain)).toBe(true);
  });

  it('100% always collapses all loose ground after a shot', () => {
    expect(hasLooseDirt(roundAfterShot(100).terrain)).toBe(false);
  });
});

describe('falling tanks', () => {
  /** Removes the ground under the current tank and lets the next shot resolve. */
  const dropUnderTank = (tanksFall: boolean) => {
    const round = new Round({
      seed: 9,
      players: players(2),
      options: { tanksFall, crumble: 0 },
      wind: 0,
      walls: false,
    });
    while (round.phase !== 'aiming') round.tick();
    const victim = round.tanks.find((t) => t.id !== round.currentId)!;
    const startY = victim.y;
    for (let x = victim.x - 12; x <= victim.x + 12; x++) {
      for (let y = victim.y; y < victim.y + 60; y++) round.terrain.set(x, y, Material.Air);
    }
    const shooter = round.current!;
    // Shoot straight away from everyone and off the field so it's lost without a blast.
    round.command({ type: 'aim', delta: (shooter.x < victim.x ? 175 : 5) - shooter.angle });
    round.command({ type: 'power', delta: 1000 });
    round.command({ type: 'fire' });
    let guard = 0;
    while (round.phase !== 'aiming' && round.phase !== 'roundOver' && guard++ < 10_000) {
      round.tick();
    }
    return { victim, startY, round };
  };

  it('fall damage grows with distance and ignores short drops', () => {
    expect(fallDamage(3)).toBe(0);
    expect(fallDamage(24)).toBe(10);
    expect(fallDamage(104)).toBe(50);
  });

  it('on: tanks fall onto ground below and take damage', () => {
    const { victim, startY, round } = dropUnderTank(true);
    expect(victim.y).toBe(startY + 60);
    expect(isSupported(victim, round.terrain)).toBe(true);
    expect(victim.health).toBe(100 - fallDamage(60));
  });

  it('off: tanks hover unharmed', () => {
    const { victim, startY, round } = dropUnderTank(false);
    expect(victim.y).toBe(startY);
    expect(isSupported(victim, round.terrain)).toBe(false);
    expect(victim.health).toBe(100);
  });
});
