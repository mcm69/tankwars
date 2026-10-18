import { launch, stepProjectile, type StepResult } from '../sim/physics';
import type { Round } from '../sim/round';
import { barrelTip, TURRET_PIVOT, type Tank } from '../sim/tank';

export interface ProbeOptions {
  /** Wind to assume (Windless Wit assumes 0). Defaults to the real wind. */
  wind?: number;
  /** Wall behavior to assume. Defaults to the real one. */
  walls?: boolean;
}

export interface ProbeResult {
  /** Final outcome: hit terrain, hit a tank, or left the field. */
  result: StepResult;
  /** Lowest y reached (smallest value = highest point), to spot ceiling bounces. */
  minY: number;
  /** Whether the shell bounced off the ceiling. */
  touchedCeiling: boolean;
}

/**
 * Simulates a shot without changing anything: same physics as the real thing (minus duds),
 * on the current terrain. This is how computers "think" about a shot.
 */
export function probeShot(
  round: Round,
  shooter: Tank,
  angle: number,
  power: number,
  opts: ProbeOptions = {},
): ProbeResult {
  const ghost: Tank = { ...shooter, angle, power };
  const p = launch(ghost, shooter.selected);
  const world = {
    terrain: round.terrain,
    tanks: round.tanks,
    wind: opts.wind ?? round.wind,
    walls: opts.walls ?? round.walls,
  };
  let minY = p.y;
  let touchedCeiling = false;
  let lastVy = p.vy;
  for (;;) {
    const r = stepProjectile(p, world);
    minY = Math.min(minY, p.y);
    // A sign flip from rising to falling near the top with walls on means a ceiling bounce.
    if (world.walls && lastVy < 0 && p.vy > 0 && p.y < 4) touchedCeiling = true;
    lastVy = p.vy;
    if (r.kind !== 'flying') return { result: r, minY, touchedCeiling };
  }
}

/** Where a probed shot ended up (x, y), or null if it left the field. */
export function impactPoint(r: StepResult): { x: number; y: number } | null {
  return r.kind === 'lost' || r.kind === 'flying' ? null : { x: r.x, y: r.y };
}

/** Turret pivot and barrel tip helpers for aiming math. */
export function pivotOf(t: Tank): { x: number; y: number } {
  return { x: t.x, y: t.y - TURRET_PIVOT };
}

export { barrelTip };
