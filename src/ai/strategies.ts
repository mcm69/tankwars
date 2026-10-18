import type { Rng } from '../core/rng';
import { ITEMS, LEAD_BALL, WEAPON_COUNT, itemIndex } from '../sim/items';
import type { Round } from '../sim/round';
import { maxPower, tankCenter, TURRET_PIVOT, type Tank } from '../sim/tank';
import { Material } from '../sim/terrain';
import { behaviorOf, LASER_MIN_ENERGY } from '../sim/weapons';
import { impactPoint, probeShot, type ProbeOptions } from './probe';

/** What a computer decided to do this turn. */
export interface AiPlan {
  weapon: number;
  angle: number;
  power: number;
}

/** Per-player notes kept for the length of one round (e.g. Lobber's chosen target). */
export interface AiMemory {
  targetId?: number;
}

export interface AiContext {
  round: Round;
  me: Tank;
  rng: Rng;
  memory: AiMemory;
}

const LASER = itemIndex('laser');

// ---------------------------------------------------------------- helpers

export function enemiesOf(round: Round, me: Tank): Tank[] {
  return round.tanks.filter((t) => t.alive && t.id !== me.id);
}

function nearest(ts: Tank[], x: number): Tank | undefined {
  return [...ts].sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
}

/** Elevation mirrored to face `towardX`. */
function facing(elevation: number, me: Tank, towardX: number): number {
  return towardX >= me.x ? elevation : 180 - elevation;
}

/** The strongest owned blast that won't catch the shooter, for a target `dist` away. */
export function chooseWeapon(me: Tank, dist: number): number {
  const blasts = ITEMS.map((it, i) => ({ i, b: it.behavior }))
    .filter(({ i, b }) => i < WEAPON_COUNT && b?.kind === 'blast' && (me.inventory[i] ?? 0) > 0)
    .map(({ i, b }) => ({ i, radius: b?.kind === 'blast' ? b.radius : 0 }))
    .sort((a, b) => b.radius - a.radius);
  const safe = blasts.find((w) => w.radius + 18 < dist);
  if (safe) return safe.i;
  const smallest = blasts[blasts.length - 1];
  return smallest?.i ?? LEAD_BALL;
}

/** The weakest owned blast weapon (for ranging shots), else a Lead Ball. */
function cheapestWeapon(me: Tank): number {
  const grenade = itemIndex('grenade');
  if ((me.inventory[grenade] ?? 0) > 0) return grenade;
  return (me.inventory[LEAD_BALL] ?? 0) > 0 ? LEAD_BALL : chooseWeapon(me, 1e9);
}

function randomPlan(ctx: AiContext, weapon: number): AiPlan {
  const { me, rng } = ctx;
  return {
    weapon,
    angle: rng.int(5, 175),
    power: rng.int(100, Math.max(100, maxPower(me))),
  };
}

/**
 * Finds the power that lands a shot at `angle` on `target`, by bisecting over probes.
 * Returns the best power found and how far off (px) it lands, or a hit.
 */
export function solvePower(
  ctx: AiContext,
  angle: number,
  target: Tank,
  opts: ProbeOptions,
): { power: number; error: number } {
  const { round, me } = ctx;
  const dir = Math.sign(target.x - me.x) || 1;
  let lo = 30;
  let hi = maxPower(me);
  let best = { power: hi, error: Infinity };
  for (let i = 0; i < 22 && lo <= hi; i++) {
    const power = Math.round((lo + hi) / 2);
    const { result } = probeShot(round, me, angle, power, opts);
    if (result.kind === 'hitTank' && result.tankId === target.id) return { power, error: 0 };
    const hit = impactPoint(result);
    // Lost shots are treated as overshooting; hitting something nearer counts as short.
    const over = hit ? (hit.x - target.x) * dir : Infinity;
    const error = Math.abs(over);
    if (error < best.error) best = { power, error };
    if (over > 0) hi = power - 1;
    else lo = power + 1;
  }
  return best;
}

function aimWithProbes(
  ctx: AiContext,
  target: Tank,
  elevations: readonly number[],
  opts: ProbeOptions,
): { angle: number; power: number; error: number } {
  let best = { angle: facing(45, ctx.me, target.x), power: maxPower(ctx.me), error: Infinity };
  for (const e of elevations) {
    const angle = facing(e, ctx.me, target.x);
    const sol = solvePower(ctx, angle, target, opts);
    if (sol.error < best.error) best = { angle, ...sol };
    if (sol.error <= 3) break;
  }
  return best;
}

/**
 * Energy a laser needs to reach `target` in a straight line from the barrel, by walking the
 * line and pricing open air, ground and tanks in the way like the beam does (plus margin).
 */
export function laserEnergyNeeded(round: Round, me: Tank, target: Tank): number {
  const px = me.x;
  const py = me.y - TURRET_PIVOT;
  const c = tankCenter(target);
  const len = Math.hypot(c.x - px, c.y - py);
  let cost = 0;
  for (let d = 10; d < len; d++) {
    const x = px + ((c.x - px) * d) / len;
    const y = py + ((c.y - py) * d) / len;
    cost += round.terrain.get(Math.floor(x), Math.floor(y)) === Material.Air ? 1 : 3;
  }
  return Math.ceil(cost / 1.2) + 60;
}

/** A laser shot straight at the target, if the tank has the energy for it. */
function laserPlan(ctx: AiContext, target: Tank): AiPlan | null {
  const { round, me } = ctx;
  const energy = me.inventory[LASER] ?? 0;
  if (energy < LASER_MIN_ENERGY) return null;
  const need = Math.max(LASER_MIN_ENERGY, laserEnergyNeeded(round, me, target));
  if (need > energy || need > maxPower(me)) return null;
  const c = tankCenter(target);
  const angle = (Math.atan2(me.y - TURRET_PIVOT - c.y, c.x - me.x) * 180) / Math.PI;
  if (angle < 0 || angle > 180) return null;
  return { weapon: LASER, angle: Math.round(angle), power: need };
}

// ----------------------------------------------------------- personalities

/** A complete idiot: random weapon, angle and power. Might not even face the enemy. */
export function stupid(ctx: AiContext): AiPlan {
  const owned = ITEMS.map((_, i) => i).filter(
    (i) => i < WEAPON_COUNT && (ctx.me.inventory[i] ?? 0) > 0 && behaviorOf(i).kind !== 'laser',
  );
  return randomPlan(ctx, owned.length ? ctx.rng.pick(owned) : LEAD_BALL);
}

/**
 * Two ranging shots at 75°, then targets whoever is nearest the last impact and scales power
 * by the square root of the range error (range ∝ power²). Strong wind and bouncing walls
 * break his assumptions.
 */
export function lobber(ctx: AiContext): AiPlan {
  const { round, me, rng, memory } = ctx;
  const enemies = enemiesOf(round, me);
  const mine = round.shotLog.filter(
    (s) => s.tankId === me.id && behaviorOf(s.weapon).kind !== 'laser',
  );
  const lastImpact = [...mine].reverse().find((s) => s.impact)?.impact ?? null;

  if (mine.length < 2) {
    const toward = nearest(enemies, me.x)?.x ?? me.x + 1;
    return {
      weapon: cheapestWeapon(me),
      angle: facing(75, me, toward),
      power: rng.int(250, Math.max(250, maxPower(me))),
    };
  }

  let target = memory.targetId === undefined ? undefined : round.tanks[memory.targetId];
  if (!target?.alive) {
    target = nearest(enemies, lastImpact?.x ?? me.x);
    if (target) memory.targetId = target.id;
    else delete memory.targetId;
  }
  if (!target) return randomPlan(ctx, cheapestWeapon(me));

  const angle = facing(75, me, target.x);
  const want = target.x - me.x;
  const last = [...mine].reverse().find((s) => s.impact && s.angle === angle);
  let power = rng.int(250, Math.max(250, maxPower(me)));
  if (last?.impact) {
    const got = last.impact.x - me.x;
    if (Math.sign(got) === Math.sign(want) && Math.abs(got) > 5) {
      power = Math.round(last.power * Math.sqrt(want / got));
    }
  }
  return {
    weapon: chooseWeapon(me, Math.abs(want)),
    angle,
    power: Math.max(30, Math.min(maxPower(me), power)),
  };
}

/**
 * If someone is above him, points straight at them at full power (a laser if he can afford
 * the shot); otherwise shoots at random.
 */
export function rifleman(ctx: AiContext): AiPlan {
  const { round, me } = ctx;
  const enemies = enemiesOf(round, me);
  for (const t of [...enemies].sort((a, b) => Math.abs(a.x - me.x) - Math.abs(b.x - me.x))) {
    const laser = laserPlan(ctx, t);
    if (laser) return laser;
  }
  const above = enemies.filter((t) => t.y < me.y - 8);
  const target = nearest(above, me.x);
  if (!target) return stupid(ctx);
  const c = tankCenter(target);
  const angle = (Math.atan2(me.y - TURRET_PIVOT - c.y, c.x - me.x) * 180) / Math.PI;
  return {
    weapon: chooseWeapon(me, Math.hypot(c.x - me.x, c.y - me.y)),
    angle: Math.round(angle),
    power: maxPower(me),
  };
}

/** Exact ballistics, but he has never heard of wind. */
export function windlessWit(ctx: AiContext): AiPlan {
  const { round, me } = ctx;
  const target = nearest(enemiesOf(round, me), me.x);
  if (!target) return stupid(ctx);
  const aim = aimWithProbes(ctx, target, [45, 60, 35, 70, 25, 80], { wind: 0 });
  return {
    weapon: chooseWeapon(me, Math.abs(target.x - me.x)),
    angle: aim.angle,
    power: aim.power,
  };
}

/** Lobber when the walls don't bounce; Rifleman when they do. */
export function lobAndShoot(ctx: AiContext): AiPlan {
  return ctx.round.walls ? rifleman(ctx) : lobber(ctx);
}

/**
 * Rifleman without bouncing walls. With them, banks shots off the ceiling onto the easiest
 * kill (weakest, then nearest), and picks a weapon that won't catch himself.
 */
export function twanger(ctx: AiContext): AiPlan {
  const { round, me } = ctx;
  if (!round.walls) return rifleman(ctx);
  const enemies = enemiesOf(round, me).sort(
    (a, b) => a.health - b.health || Math.abs(a.x - me.x) - Math.abs(b.x - me.x),
  );
  const target = enemies[0];
  if (!target) return stupid(ctx);
  const laser = laserPlan(ctx, target);
  if (laser) return laser;
  let best: { angle: number; power: number; error: number } | null = null;
  const top = maxPower(me);
  for (let e = 62; e <= 88; e += 4) {
    for (const angle of [facing(e, me, target.x), facing(e, me, 2 * me.x - target.x)]) {
      for (let power = Math.min(top, 600); power <= top; power += 50) {
        const probe = probeShot(round, me, angle, power);
        if (!probe.touchedCeiling) continue;
        const r = probe.result;
        const hit = r.kind === 'hitTank' && r.tankId === target.id;
        const at = impactPoint(r);
        const error = hit ? 0 : at ? Math.abs(at.x - target.x) : Infinity;
        if (!best || error < best.error) best = { angle, power, error };
      }
    }
  }
  if (!best || best.error > 60) return rifleman(ctx);
  return {
    weapon: chooseWeapon(me, Math.abs(target.x - me.x)),
    angle: best.angle,
    power: best.power,
  };
}

/** New in the remake: accounts for wind and walls, picks off the weakest. Deadly. */
export function birdyBonker(ctx: AiContext): AiPlan {
  const { round, me, rng } = ctx;
  const enemies = enemiesOf(round, me).sort(
    (a, b) => a.health * 2 + Math.abs(a.x - me.x) / 10 - (b.health * 2 + Math.abs(b.x - me.x) / 10),
  );
  const target = enemies[0];
  if (!target) return stupid(ctx);
  const aim = aimWithProbes(ctx, target, [50, 40, 60, 30, 70, 80, 20], {});
  // A hair of human error so he isn't perfect.
  const power = Math.max(30, Math.min(maxPower(me), aim.power + rng.int(-4, 4)));
  return { weapon: chooseWeapon(me, Math.abs(target.x - me.x)), angle: aim.angle, power };
}
