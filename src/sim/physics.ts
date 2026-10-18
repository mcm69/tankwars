import { GRAVITY, MAX_FLIGHT_TICKS, POWER_TO_SPEED, WIND_ACCEL } from './constants';
import { barrelTip, hitsTank, type Tank } from './tank';
import type { Terrain } from './terrain';

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Position at the start of the last tick, for render interpolation. */
  prevX: number;
  prevY: number;
  readonly ownerId: number;
  age: number;
}

export type StepResult =
  | { kind: 'flying' }
  | { kind: 'hitTerrain'; x: number; y: number }
  | { kind: 'hitTank'; x: number; y: number; tankId: number }
  | { kind: 'lost' };

export interface PhysicsWorld {
  terrain: Terrain;
  tanks: readonly Tank[];
  wind: number;
}

export function launch(tank: Tank): Projectile {
  const a = (tank.angle * Math.PI) / 180;
  const speed = tank.power * POWER_TO_SPEED;
  const tip = barrelTip(tank);
  return {
    x: tip.x,
    y: tip.y,
    prevX: tip.x,
    prevY: tip.y,
    vx: Math.cos(a) * speed,
    vy: -Math.sin(a) * speed,
    ownerId: tank.id,
    age: 0,
  };
}

/**
 * Advances a projectile by one tick (semi-implicit Euler), sweeping the path in sub-steps of
 * at most 1 px so fast shots can't tunnel through thin ground or tanks.
 */
export function stepProjectile(p: Projectile, world: PhysicsWorld): StepResult {
  const { terrain, tanks, wind } = world;
  p.prevX = p.x;
  p.prevY = p.y;
  p.age++;
  p.vx += wind * WIND_ACCEL;
  p.vy += GRAVITY;

  const steps = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy)));
  const sx = p.vx / steps;
  const sy = p.vy / steps;
  for (let i = 0; i < steps; i++) {
    p.x += sx;
    p.y += sy;
    for (const t of tanks) {
      if (hitsTank(t, p.x, p.y)) return { kind: 'hitTank', x: p.x, y: p.y, tankId: t.id };
    }
    if (p.y >= terrain.height) return { kind: 'hitTerrain', x: p.x, y: terrain.height - 1 };
    if (terrain.isSolid(p.x, p.y)) return { kind: 'hitTerrain', x: p.x, y: p.y };
  }

  // Off the sides: keep flying while it could still come back (Stage 3 adds wall rules).
  const w = terrain.width;
  if (p.x < -w || p.x > 2 * w || p.age > MAX_FLIGHT_TICKS) return { kind: 'lost' };
  return { kind: 'flying' };
}
