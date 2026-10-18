import type { Effects } from './effects';
import { ITEMS, type Behavior } from './items';
import { barrelTip, hitsTank, type Tank } from './tank';
import type { World } from './world';

/** Laser energy needed to fire at all. */
export const LASER_MIN_ENERGY = 100;
/** Beam length budget per unit of energy spent. */
const LASER_RANGE_PER_ENERGY = 1.2;
/** Boring through ground costs this much more range than open air. */
const LASER_DIRT_COST = 3;
/** Range consumed by passing through a tank. */
const LASER_TANK_COST = 120;
const LASER_TUNNEL_RADIUS = 2;
/** Damage of a dud boring through a tank. */
export const DUD_DAMAGE = 25;

/** Small blast that accompanies "soft" weapons on impact. */
const SOFT_BLAST: Partial<Record<Behavior['kind'], { radius: number; damage: number }>> = {
  cri: { radius: 5, damage: 30 },
  sonic: { radius: 5, damage: 15 },
  explosiveDirt: { radius: 6, damage: 30 },
};

export function behaviorOf(weapon: number): Behavior {
  return ITEMS[weapon]?.behavior ?? { kind: 'harmless' };
}

/** Whether a weapon can fail to detonate and bore through a tank instead. */
export function canDud(b: Behavior): boolean {
  return b.kind === 'blast' || b.kind === 'cri' || b.kind === 'sonic' || b.kind === 'explosiveDirt';
}

/**
 * Chance that a shell bores through a tank without detonating. Rare normally; much likelier
 * for very fast impacts (the original's Rifleman "fires so hard the bomb doesn't detonate").
 */
export function dudChance(speed: number): number {
  return speed > 7.2 ? 0.12 : 0.025;
}

/** Applies a weapon's effect at an impact point. */
export function detonate(world: World, fx: Effects, weapon: number, x: number, y: number): void {
  const b = behaviorOf(weapon);
  const soft = SOFT_BLAST[b.kind];
  if (soft) fx.blast(world, x, y, soft.radius, soft.damage);
  switch (b.kind) {
    case 'blast':
      fx.blast(world, x, y, b.radius, b.damage);
      break;
    case 'harmless':
    case 'laser': // never lands; fired as a beam
      fx.puff(world, x, y);
      break;
    case 'cri':
      fx.reaction(world, x, y, b.budget, b.fluid);
      break;
    case 'sonic':
      fx.wave(world, x, y);
      world.forceCrumble = true;
      break;
    case 'dirt':
      fx.dirtFill(world, x, y, b.radius);
      break;
    case 'explosiveDirt':
      fx.clods(world, x, y, b.clods);
      break;
  }
}

export interface LaserResult {
  points: { x: number; y: number }[];
  hits: Map<number, number>;
}

/**
 * Fires a straight beam from the barrel. Its range is the energy spent; it bores a tunnel
 * through ground (at extra cost), pierces tanks (damaging them more the fresher the beam), and
 * reflects off the sides and ceiling when walls are on.
 */
export function fireLaser(world: World, shooter: Tank, energy: number): LaserResult {
  const { terrain, tanks, walls } = world;
  const a = (shooter.angle * Math.PI) / 180;
  let dx = Math.cos(a);
  let dy = -Math.sin(a);
  const start = barrelTip(shooter);
  let x = start.x;
  let y = start.y;
  const points = [{ x, y }];
  const hits = new Map<number, number>();
  const total = energy * LASER_RANGE_PER_ENERGY;
  let budget = total;
  let travelled = 0;
  while (budget > 0) {
    x += dx;
    y += dy;
    travelled++;
    if (x < 0 || x >= terrain.width || y < 0) {
      if (!walls) break;
      if (x < 0 || x >= terrain.width) {
        dx = -dx;
        x = Math.min(terrain.width - 1, Math.max(0, x));
      }
      if (y < 0) {
        dy = -dy;
        y = 0;
      }
      points.push({ x, y });
    }
    if (y >= terrain.height) break;
    let cost = 1;
    for (const t of tanks) {
      if (hits.has(t.id) || !hitsTank(t, x, y)) continue;
      if (t.id === shooter.id && travelled < 20) continue; // don't zap yourself on the way out
      hits.set(t.id, Math.round(40 + 60 * (budget / total)));
      cost += LASER_TANK_COST;
    }
    if (terrain.isSolid(x, y)) {
      terrain.carveCircle(x, y, LASER_TUNNEL_RADIUS);
      cost = Math.max(cost, LASER_DIRT_COST);
    }
    budget -= cost;
  }
  points.push({ x, y });
  for (const [id, dmg] of hits) world.damage(id, dmg);
  return { points, hits };
}
