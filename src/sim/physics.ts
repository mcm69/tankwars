import { GRAVITY, MAX_FLIGHT_TICKS, MAX_SPEED, POWER_TO_SPEED, WIND_ACCEL } from './constants';
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
  /** Item index of the weapon in flight. */
  readonly weapon: number;
  /** Tanks this shell already bored through as a dud (it ignores them from then on). */
  readonly passed: number[];
  age: number;
  /** Guidance toward a target point, and which axis has locked on (if any). */
  guidance?: Guidance;
}

/**
 * Herb's (H) system locks the shell onto the target's column when it passes over it, so it
 * drops straight down. Vick's (V) system locks onto the target's height when the descending
 * shell reaches it, and flies level straight at the target. Neither helps if the shell never
 * crosses that line, and either can steer a shell into a hill: easy to misuse.
 */
export interface Guidance {
  readonly axis: 'H' | 'V';
  readonly tx: number;
  readonly ty: number;
  locked: boolean;
}

/** Speed of a Vick's-guided shell flying level at its target. */
const LEVEL_FLIGHT_SPEED = 3;

export type StepResult =
  | { kind: 'flying' }
  | { kind: 'hitTerrain'; x: number; y: number }
  | { kind: 'hitTank'; x: number; y: number; tankId: number }
  | { kind: 'lost' };

export interface PhysicsWorld {
  terrain: Terrain;
  tanks: readonly Tank[];
  wind: number;
  walls: boolean;
}

export function launch(tank: Tank, weapon = tank.selected): Projectile {
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
    weapon,
    passed: [],
    age: 0,
  };
}

/**
 * Advances a projectile by one tick (semi-implicit Euler), sweeping the path in sub-steps of
 * at most 1 px so fast shots can't tunnel through thin ground or tanks.
 *
 * Walls on: the shot reflects off the sides and ceiling (the floor is ground).
 * Walls off: it may leave the field and come back, but is dropped as soon as it is off a side,
 * moving away, with no wind to bring it back.
 */
export function stepProjectile(p: Projectile, world: PhysicsWorld): StepResult {
  const { terrain, tanks, wind, walls } = world;
  const w = terrain.width;
  const windAccel = wind * WIND_ACCEL;
  p.prevX = p.x;
  p.prevY = p.y;
  p.age++;
  const g = p.guidance;
  // A locked H shell falls straight down (no wind); a locked V shell flies level (no gravity).
  if (g?.locked && g.axis === 'H') p.vx = 0;
  else p.vx = clampSpeed(p.vx + windAccel);
  if (g?.locked && g.axis === 'V') p.vy = 0;
  else p.vy = clampSpeed(p.vy + GRAVITY);

  const steps = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy)));
  let sx = p.vx / steps;
  let sy = p.vy / steps;
  for (let i = 0; i < steps; i++) {
    const lastX = p.x;
    const lastY = p.y;
    p.x += sx;
    p.y += sy;
    if (g && !g.locked && guide(p, g, lastX, lastY)) {
      sx = p.vx / steps;
      sy = p.vy / steps;
    }
    if (walls) {
      if (p.x < 0 || p.x >= w) {
        p.x = p.x < 0 ? -p.x : 2 * (w - 1e-6) - p.x;
        sx = -sx;
        p.vx = -p.vx;
      }
      if (p.y < 0) {
        p.y = -p.y;
        sy = -sy;
        p.vy = -p.vy;
      }
    }
    for (const t of tanks) {
      if (hitsTank(t, p.x, p.y) && !p.passed.includes(t.id)) {
        return { kind: 'hitTank', x: p.x, y: p.y, tankId: t.id };
      }
    }
    if (p.y >= terrain.height) return { kind: 'hitTerrain', x: p.x, y: terrain.height - 1 };
    if (terrain.isSolid(p.x, p.y)) return { kind: 'hitTerrain', x: p.x, y: p.y };
  }

  if (p.age > MAX_FLIGHT_TICKS) return { kind: 'lost' };
  if (!walls) {
    const goneLeft = p.x < 0 && p.vx <= 0 && windAccel <= 0;
    const goneRight = p.x >= w && p.vx >= 0 && windAccel >= 0;
    if (goneLeft || goneRight || p.x < -2 * w || p.x > 3 * w) return { kind: 'lost' };
  }
  return { kind: 'flying' };
}

/** Checks whether the shell just crossed its guidance line, and locks on if so. */
function guide(p: Projectile, g: Guidance, lastX: number, lastY: number): boolean {
  if (g.axis === 'H') {
    if ((lastX - g.tx) * (p.x - g.tx) > 0) return false;
    p.x = g.tx;
    p.vx = 0;
  } else {
    if (!(p.vy > 0 && lastY < g.ty && p.y >= g.ty)) return false;
    p.y = g.ty;
    p.vy = 0;
    p.vx = Math.sign(g.tx - p.x || 1) * Math.max(Math.abs(p.vx), LEVEL_FLIGHT_SPEED);
  }
  g.locked = true;
  return true;
}

function clampSpeed(v: number): number {
  return Math.max(-MAX_SPEED, Math.min(MAX_SPEED, v));
}
