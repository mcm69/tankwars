import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { hasLooseDirt } from '../src/sim/crumble';
import { DEBRIS_DAMAGE, Effects } from '../src/sim/effects';
import { fullInventory, itemIndex, ITEMS } from '../src/sim/items';
import { DEFAULT_OPTIONS, type GameOptions } from '../src/sim/options';
import { Round, type RoundEvent } from '../src/sim/round';
import { createTank, type Tank } from '../src/sim/tank';
import { Material, Terrain } from '../src/sim/terrain';
import {
  detonate,
  dudChance,
  fireLaser,
  isTrickShot,
  LASER_MIN_ENERGY,
  TRICK_SHOT_POWER,
} from '../src/sim/weapons';
import type { World } from '../src/sim/world';

const W = 624;
const H = 320;

function flat(surface: number): Terrain {
  const t = new Terrain(W, H);
  t.fillFromSurface(new Array(W).fill(surface));
  return t;
}

const solidCount = (t: Terrain) => t.cells.reduce((n, c) => n + (c === Material.Air ? 0 : 1), 0);

type TestWorld = World & { events: RoundEvent[] };

function world(terrain: Terrain, tanks: Tank[] = [], opts: Partial<GameOptions> = {}): TestWorld {
  const events: RoundEvent[] = [];
  return {
    terrain,
    tanks,
    rng: new Rng(42),
    options: { ...DEFAULT_OPTIONS, ...opts },
    walls: false,
    forceCrumble: false,
    events,
    damage(id, amount) {
      const t = tanks[id];
      if (!t?.alive) return;
      t.health = Math.max(0, t.health - amount);
      events.push({ type: 'tankHit', tankId: id, damage: amount });
    },
    emit(e) {
      events.push(e);
    },
  };
}

/** Ticks effects until idle; returns ticks taken. */
function runEffects(w: World, fx: Effects, limit = 5000): number {
  let n = 0;
  while (fx.busy && n < limit) {
    fx.tick(w);
    n++;
  }
  if (fx.busy) throw new Error('effects never finished');
  return n;
}

function fireAt(id: string, terrain: Terrain, x: number, y: number, tanks: Tank[] = []) {
  const w = world(terrain, tanks);
  const fx = new Effects();
  detonate(w, fx, itemIndex(id), x, y);
  const ticks = runEffects(w, fx);
  return { w, fx, ticks };
}

describe('blast weapons', () => {
  it('craters grow with each tier', () => {
    const tiers = ['grenade', 'incinerator', 'incineratorMk2', 'nuke20kt', 'nuke5mt'];
    const removed = tiers.map((id) => {
      const t = flat(160);
      const before = solidCount(t);
      fireAt(id, t, 312, 160);
      return before - solidCount(t);
    });
    for (let i = 1; i < removed.length; i++) expect(removed[i]!).toBeGreaterThan(removed[i - 1]!);
  });

  it('a 5 Mt nuke can catch many tanks at once', () => {
    const t = flat(200);
    const tanks = [-90, -60, -30, 30, 60, 90].map((dx, i) =>
      createTank(i, `t${i}`, i, 312 + dx, 200),
    );
    fireAt('nuke5mt', t, 312, 200, tanks);
    expect(tanks.filter((k) => k.health < 100).length).toBe(6);
  });

  it('the Lead Ball changes nothing and just puffs', () => {
    const t = flat(160);
    const before = Uint8Array.from(t.cells);
    const { w } = fireAt('leadBall', t, 312, 160);
    expect(t.cells).toEqual(before);
    expect(w.events).toContainEqual(expect.objectContaining({ type: 'explode', harmless: true }));
  });
});

describe('dirt weapons', () => {
  it('balls of dirt add more dirt with each tier, filling only air', () => {
    const tiers = ['dirtBall', 'dirtBallMk2', 'dirtCompressed', 'dirtSuper'];
    const added = tiers.map((id) => {
      const t = flat(200);
      const before = solidCount(t);
      fireAt(id, t, 312, 140);
      return solidCount(t) - before;
    });
    for (let i = 1; i < added.length; i++) expect(added[i]!).toBeGreaterThan(added[i - 1]!);
    expect(added[0]!).toBeGreaterThan(500);
  });

  it('explosive dirt throws dirt up into the air', () => {
    const t = flat(220);
    const airAbove = () => {
      let n = 0;
      for (let y = 0; y < 200; y++) for (let x = 0; x < W; x++) if (t.get(x, y)) n++;
      return n;
    };
    expect(airAbove()).toBe(0);
    fireAt('dirtExplosive', t, 312, 220);
    expect(airAbove()).toBeGreaterThan(50);
    expect(hasLooseDirt(t)).toBe(true); // floating clods, for crumble to decide about
  });
});

describe('chain reaction inducers', () => {
  const cris = ['cri4d', 'cri8nd', 'cri8d', 'cri20nd', 'cri20d'];

  it.each(cris)('%s eats ground, stays within its budget, and terminates', (id) => {
    const t = flat(40);
    const before = solidCount(t);
    const { ticks } = fireAt(id, t, 312, 160);
    const eaten = before - solidCount(t);
    const b = ITEMS[itemIndex(id)]!.behavior;
    if (b?.kind !== 'cri') throw new Error('not a CRI');
    expect(eaten).toBeGreaterThan(80); // at least the seed blast and a bit
    expect(eaten).toBeLessThanOrEqual(b.budget + 120); // budget + the small seed blast
    expect(ticks).toBeLessThan(1000);
  });

  it('stronger and "D" reactions eat more', () => {
    const eat = (id: string) => {
      const t = flat(40);
      const before = solidCount(t);
      fireAt(id, t, 312, 160);
      return before - solidCount(t);
    };
    expect(eat('cri20d')).toBeGreaterThan(eat('cri4d'));
    expect(eat('cri8d')).toBeGreaterThan(eat('cri8nd') * 0.8);
  });

  it('is deterministic', () => {
    const a = flat(40);
    const b = flat(40);
    fireAt('cri8nd', a, 300, 150);
    fireAt('cri8nd', b, 300, 150);
    expect(a.cells).toEqual(b.cells);
  });

  it('harms tanks it burns around, up to a cap', () => {
    const t = flat(100);
    const tank = createTank(0, 'a', 0, 312, 100);
    fireAt('cri20d', t, 312, 120, [tank]);
    expect(tank.health).toBeLessThan(100);
    expect(tank.health).toBeGreaterThanOrEqual(100 - 40 - 30);
  });
});

describe('sonic blaster', () => {
  it('flags a forced collapse and sends out a wave', () => {
    const t = flat(160);
    const w = world(t);
    const fx = new Effects();
    detonate(w, fx, itemIndex('sonic'), 312, 160);
    expect(w.forceCrumble).toBe(true);
    expect(fx.waves).toHaveLength(1);
  });

  it('collapses loose ground even with crumble at 0%', () => {
    const inv = fullInventory(5);
    const round = new Round({
      seed: 5,
      players: [
        { name: 'a', color: 0, inventory: inv },
        { name: 'b', color: 1, inventory: inv },
      ],
      options: { crumble: 0 },
      wind: 0,
      walls: false,
    });
    while (round.phase !== 'aiming') round.tick();
    const xs = round.tanks.map((k) => k.x);
    const cx = Math.round((xs[0]! + xs[1]!) / 2);
    const top = round.terrain.surfaceY(cx);
    for (let x = cx - 6; x <= cx + 6; x++) {
      for (let y = top + 6; y < top + 20; y++) round.terrain.set(x, y, Material.Air);
    }
    expect(hasLooseDirt(round.terrain)).toBe(true);
    round.command({ type: 'selectWeapon', index: itemIndex('sonic') });
    round.command({ type: 'setPower', power: 0 });
    round.command({ type: 'fire' });
    let guard = 0;
    while (round.phase !== 'aiming' && round.phase !== 'roundOver' && guard++ < 10_000)
      round.tick();
    expect(hasLooseDirt(round.terrain)).toBe(false);
  });
});

describe('laser', () => {
  it('bores a tunnel and pierces tanks in line', () => {
    const t = flat(200);
    for (let x = 300; x < 400; x++) for (let y = 150; y < 200; y++) t.set(x, y, Material.Dirt);
    const shooter = createTank(0, 'a', 0, 100, 200);
    const target = createTank(1, 'b', 1, 500, 200);
    shooter.angle = 0;
    const w = world(t, [shooter, target]);
    const before = solidCount(t);
    const { hits } = fireLaser(w, shooter, 1000);
    expect(solidCount(t)).toBeLessThan(before);
    expect(hits.get(1)).toBeGreaterThan(0);
    expect(target.health).toBeLessThan(100);
    expect(shooter.health).toBe(100);
  });

  it('range depends on energy', () => {
    const shooter = createTank(0, 'a', 0, 50, 300);
    shooter.angle = 0;
    const end = (energy: number) =>
      fireLaser(world(new Terrain(W, H), [shooter]), shooter, energy).points.at(-1)!.x;
    expect(end(200)).toBeLessThan(end(400));
  });

  it('reflects off the walls when they bounce, staying in the field', () => {
    const shooter = createTank(0, 'a', 0, 100, 300);
    shooter.angle = 70;
    const w = { ...world(new Terrain(W, H), [shooter]), walls: true };
    const { points } = fireLaser(w, shooter, 1000);
    expect(points.length).toBeGreaterThan(2);
    for (const p of points) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThan(W);
      expect(p.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('spends energy equal to power and refuses to fire below the minimum', () => {
    const inv = new Array(ITEMS.length).fill(0);
    inv[itemIndex('laser')] = 1000;
    const round = new Round({
      seed: 2,
      players: [
        { name: 'a', color: 0, inventory: inv },
        { name: 'b', color: 1, inventory: inv },
      ],
      wind: 0,
    });
    while (round.phase !== 'aiming') round.tick();
    const t = round.current!;
    expect(t.selected).toBe(itemIndex('laser'));
    round.command({ type: 'setPower', power: 50 });
    expect(round.command({ type: 'fire' })).toBe(false);
    expect(round.drainEvents()).toContainEqual(expect.objectContaining({ type: 'fireRejected' }));
    round.command({ type: 'setPower', power: 300 });
    expect(round.command({ type: 'fire' })).toBe(true);
    expect(t.inventory[itemIndex('laser')]).toBe(700);
    expect(round.phase).toBe('effects');
    expect(round.effects.beams).toHaveLength(1);
    expect(LASER_MIN_ENERGY).toBe(100);
  });
});

describe('trick shot (Men = 100, power 800)', () => {
  it('only triggers at full health and exactly 800 power, for non-laser weapons', () => {
    const t = createTank(0, 'a', 0, 100, 200);
    t.power = TRICK_SHOT_POWER;
    expect(isTrickShot(t, 0)).toBe(true);
    expect(isTrickShot(t, itemIndex('laser'))).toBe(false);
    t.power = 799;
    expect(isTrickShot(t, 0)).toBe(false);
    t.power = TRICK_SHOT_POWER;
    t.health = 99;
    expect(isTrickShot(t, 0)).toBe(false);
  });

  /** A round on flat ground, at the trick shot setting, with the given walls. */
  function trickRound(walls: 'on' | 'off', inventory?: number[]) {
    const round = new Round({
      seed: 2,
      players: [
        { name: 'a', color: 0, ...(inventory ? { inventory } : {}) },
        { name: 'b', color: 1, ...(inventory ? { inventory } : {}) },
      ],
      wind: 0,
      options: { ...DEFAULT_OPTIONS, walls, crumble: 0 },
    });
    while (round.phase !== 'aiming') round.tick();
    round.command({ type: 'setPower', power: TRICK_SHOT_POWER });
    return round;
  }

  function flyOut(round: Round): RoundEvent[] {
    const events: RoundEvent[] = [];
    for (let i = 0; i < 4000 && round.projectile; i++) {
      round.tick();
      events.push(...round.drainEvents());
    }
    return events;
  }

  it('flies dead straight as a shell, boring a tunnel through the ground', () => {
    const round = trickRound('on');
    const t = round.current!;
    round.command({ type: 'setAim', angle: 70 });
    const before = solidCount(round.terrain);
    expect(round.command({ type: 'fire' })).toBe(true);
    const p = round.projectile!;
    expect(p.trick).toBe(true);
    const speed = Math.hypot(p.vx, p.vy);
    for (let i = 0; i < 30 && round.projectile; i++) round.tick();
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(speed); // no gravity, no wind
    flyOut(round);
    expect(solidCount(round.terrain)).toBeLessThan(before);
    expect(round.projectile).toBeNull();
    // It found a tank (with walls on it can't escape) and went off as the selected weapon.
    expect(round.phase).toBe('effects');
    expect(t.alive).toBe(true);
  });

  it('goes off as whatever weapon is selected (Russian roulette nuke)', () => {
    const inv = fullInventory();
    const round = trickRound('on', inv);
    round.command({ type: 'selectWeapon', index: itemIndex('nuke20kt') });
    round.command({ type: 'setAim', angle: 90 }); // straight up: off the ceiling, back home
    round.command({ type: 'fire' });
    const events = flyOut(round);
    const boom = events.find((e) => e.type === 'explode');
    expect(boom).toMatchObject({ radius: 62 });
  });

  it('is lost when it leaves the field without walls', () => {
    const round = trickRound('off');
    round.command({ type: 'setAim', angle: 60 });
    round.command({ type: 'fire' });
    const events = flyOut(round);
    expect(events.some((e) => e.type === 'explode')).toBe(false);
  });

  it('never applies below full health', () => {
    const round = trickRound('on');
    round.current!.health = 99;
    round.command({ type: 'setPower', power: TRICK_SHOT_POWER });
    round.command({ type: 'fire' });
    expect(round.projectile?.trick).toBeUndefined();
  });
});

describe('duds', () => {
  it('are rare, and likelier for very fast impacts', () => {
    expect(dudChance(3)).toBeLessThan(0.05);
    expect(dudChance(8)).toBeGreaterThan(dudChance(3));
  });

  /** Shooter fires flat into a tank parked 30 px away. */
  const pointBlank = (dud: number, weapon: string) => {
    const round = new Round({
      seed: 8,
      players: [
        { name: 'a', color: 0, inventory: fullInventory(5) },
        { name: 'b', color: 1, inventory: fullInventory(5) },
      ],
      wind: 0,
      walls: false,
      dudChance: dud,
      options: { tanksFall: false, crumble: 0 },
    });
    while (round.phase !== 'aiming') round.tick();
    const me = round.current!;
    const other = round.tanks.find((k) => k.id !== me.id)!;
    other.x = me.x + 30;
    other.y = me.y;
    round.command({ type: 'selectWeapon', index: itemIndex(weapon) });
    round.command({ type: 'setAim', angle: 0 });
    round.command({ type: 'setPower', power: 300 });
    round.command({ type: 'fire' });
    const events: RoundEvent[] = [];
    let guard = 0;
    while (round.phase !== 'aiming' && round.phase !== 'roundOver' && guard++ < 10_000) {
      round.tick();
      events.push(...round.drainEvents());
    }
    return { events, other };
  };

  it('a dud bores through the tank and flies on', () => {
    const { events, other } = pointBlank(1, 'incinerator');
    expect(events).toContainEqual({ type: 'dud', tankId: other.id });
    expect(events).toContainEqual({ type: 'tankHit', tankId: other.id, damage: 25 });
    // A dud is spent: it never goes off later (e.g. in the ground right behind the tank).
    expect(events.some((e) => e.type === 'explode' && !e.harmless)).toBe(false);
    expect(other.health).toBe(75);
  });

  it('no dud means a normal detonation on the tank', () => {
    const { events, other } = pointBlank(0, 'incinerator');
    expect(events.some((e) => e.type === 'dud')).toBe(false);
    expect(other.health).toBeLessThan(75);
  });

  it('dirt and lead balls never dud', () => {
    expect(pointBlank(1, 'dirtBall').events.some((e) => e.type === 'dud')).toBe(false);
    expect(pointBlank(1, 'leadBall').events.some((e) => e.type === 'dud')).toBe(false);
  });
});

describe('tank deaths', () => {
  const kill = (style: 'standard' | 'dirt' | 'fade' | 'meltdown') => {
    const round = new Round({
      seed: 12,
      players: [
        { name: 'a', color: 0 },
        { name: 'b', color: 1 },
        { name: 'c', color: 2 },
      ],
      wind: 0,
      walls: false,
      deathStyle: style,
      options: { crumble: 0 },
    });
    while (round.phase !== 'aiming') round.tick();
    const victim = round.tanks.find((k) => k.id !== round.currentId)!;
    victim.health = 0;
    const before = solidCount(round.terrain);
    round.command({ type: 'selectWeapon', index: itemIndex('leadBall') });
    round.command({ type: 'setAim', angle: 90 });
    round.command({ type: 'setPower', power: 0 });
    round.command({ type: 'fire' });
    const events: RoundEvent[] = [];
    let guard = 0;
    while (round.phase !== 'aiming' && round.phase !== 'roundOver' && guard++ < 10_000) {
      round.tick();
      events.push(...round.drainEvents());
    }
    return { events, victim, delta: solidCount(round.terrain) - before };
  };

  it('standard: final blast plus debris', () => {
    const { events, victim, delta } = kill('standard');
    expect(events).toContainEqual({ type: 'tankDied', tankId: victim.id, style: 'standard' });
    expect(events).toContainEqual(expect.objectContaining({ type: 'explode', radius: 22 }));
    expect(delta).toBeLessThan(0);
  });

  it('dirt: buries the spot in dirt instead of exploding', () => {
    const { events, delta } = kill('dirt');
    expect(events.some((e) => e.type === 'explode' && !e.harmless && e.radius > 10)).toBe(false);
    expect(delta).toBeGreaterThan(0);
  });

  it('fade: vanishes quietly', () => {
    const { events, delta } = kill('fade');
    expect(events.some((e) => e.type === 'explode' && !e.harmless)).toBe(false);
    expect(delta).toBe(0);
  });

  it('meltdown: a much bigger blast after a delay', () => {
    const { events } = kill('meltdown');
    expect(events).toContainEqual(expect.objectContaining({ type: 'explode', radius: 46 }));
  });

  it('debris hurts other tanks only when "explosions kill" is on', () => {
    const hit = (explosionsKill: boolean) => {
      const tank = createTank(0, 'a', 0, 100, 100);
      const w = world(new Terrain(W, H), [tank], { explosionsKill });
      const fx = new Effects();
      fx.particles.push({
        kind: 'debris',
        x: 80,
        y: 96,
        prevX: 80,
        prevY: 96,
        vx: 3,
        vy: 0,
        color: 1,
        life: 100,
      });
      runEffects(w, fx);
      return 100 - tank.health;
    };
    expect(hit(true)).toBe(DEBRIS_DAMAGE);
    expect(hit(false)).toBe(0);
  });
});
