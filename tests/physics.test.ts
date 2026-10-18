import { describe, expect, it } from 'vitest';
import { GRAVITY, POWER_TO_SPEED } from '../src/sim/constants';
import { blastDamage, blastDamageAt } from '../src/sim/damage';
import { launch, stepProjectile, type PhysicsWorld } from '../src/sim/physics';
import { createTank } from '../src/sim/tank';
import { Material, Terrain } from '../src/sim/terrain';

/** Flies a shot through empty space and returns x where it falls back to its launch height. */
function rangeOf(angle: number, power: number, wind: number): number {
  const world: PhysicsWorld = { terrain: new Terrain(4000, 4000), tanks: [], wind };
  const tank = createTank(0, 'a', 0, 2000, 3000);
  tank.angle = angle;
  tank.power = power;
  const p = launch(tank);
  const y0 = p.y;
  for (let i = 0; i < 10_000; i++) {
    stepProjectile(p, world);
    if (p.vy > 0 && p.y >= y0) return p.x - 2000;
  }
  throw new Error('never came down');
}

describe('projectile physics', () => {
  it('matches the analytic range without wind', () => {
    const v = 500 * POWER_TO_SPEED;
    const expected = (v * v * Math.sin(Math.PI / 2)) / GRAVITY;
    const range = rangeOf(45, 500, 0);
    expect(Math.abs(range - expected) / expected).toBeLessThan(0.05);
  });

  it('is mirror-symmetric left/right without wind', () => {
    expect(rangeOf(135, 600, 0)).toBeCloseTo(-rangeOf(45, 600, 0), 6);
  });

  it('wind pushes shots downwind', () => {
    const calm = rangeOf(45, 500, 0);
    expect(rangeOf(45, 500, 50)).toBeGreaterThan(calm + 10);
    expect(rangeOf(45, 500, -50)).toBeLessThan(calm - 10);
  });

  it('does not tunnel through a 1-px wall at full power', () => {
    const terrain = new Terrain(400, 300);
    for (let y = 0; y < 300; y++) terrain.set(200, y, Material.Dirt);
    const tank = createTank(0, 'a', 0, 50, 290);
    tank.angle = 5;
    tank.power = 1000;
    const p = launch(tank);
    let r = stepProjectile(p, { terrain, tanks: [tank], wind: 0 });
    while (r.kind === 'flying') r = stepProjectile(p, { terrain, tanks: [tank], wind: 0 });
    expect(r.kind).toBe('hitTerrain');
    if (r.kind === 'hitTerrain') expect(Math.floor(r.x)).toBe(200);
  });

  it('hits tanks in the path', () => {
    const terrain = new Terrain(400, 300);
    const shooter = createTank(0, 'a', 0, 50, 290);
    const target = createTank(1, 'b', 1, 150, 290);
    shooter.angle = 0;
    shooter.power = 1000;
    const p = launch(shooter);
    const world = { terrain, tanks: [shooter, target], wind: 0 };
    let r = stepProjectile(p, world);
    while (r.kind === 'flying') r = stepProjectile(p, world);
    expect(r).toMatchObject({ kind: 'hitTank', tankId: 1 });
  });

  it('reports shots that leave far off the side as lost', () => {
    const terrain = new Terrain(100, 300);
    const tank = createTank(0, 'a', 0, 50, 290);
    tank.angle = 30;
    tank.power = 1000;
    const p = launch(tank);
    let r = stepProjectile(p, { terrain, tanks: [], wind: 0 });
    while (r.kind === 'flying') r = stepProjectile(p, { terrain, tanks: [], wind: 0 });
    expect(r.kind).toBe('lost');
  });
});

describe('blast damage', () => {
  const blast = { x: 0, y: 0, radius: 20, damage: 150 };

  it('is full at the center, zero at the edge, and decreasing', () => {
    expect(blastDamageAt(blast, 0)).toBe(150);
    expect(blastDamageAt(blast, 27)).toBe(0);
    let prev = Infinity;
    for (let d = 0; d < 30; d++) {
      const dmg = blastDamageAt(blast, d);
      expect(dmg).toBeLessThanOrEqual(prev);
      prev = dmg;
    }
  });

  it('only damages living tanks in range', () => {
    const near = createTank(0, 'a', 0, 5, 3.5);
    const far = createTank(1, 'b', 1, 100, 0);
    const dead = createTank(2, 'c', 2, 0, 3.5);
    dead.alive = false;
    const result = blastDamage(blast, [near, far, dead]);
    expect([...result.keys()]).toEqual([0]);
  });
});
