import type { Rng } from '../core/rng';

export const WIND_LEVELS = ['none', 'low', 'standard', 'high', 'gale'] as const;
export type WindLevel = (typeof WIND_LEVELS)[number];
export type WallMode = 'off' | 'on' | 'random';

/** Game options that affect the simulation or how a round is presented. */
export interface GameOptions {
  wind: WindLevel | 'random';
  walls: WallMode;
  /** Chance (0–100) that loose ground collapses after a shot. */
  crumble: number;
  /** Unsupported tanks fall and take damage; when off they hover. */
  tanksFall: boolean;
  /** Flying debris from destroyed tanks damages other tanks (final blasts always do). */
  explosionsKill: boolean;
  /** Presentation: the shell (and its off-screen tracking markers) is drawn. */
  visibleShot: boolean;
  /** Presentation: shots leave a trail in the shooter's color for the rest of the round. */
  shotTrail: boolean;
}

/** Defaults follow the original's documented defaults. */
export const DEFAULT_OPTIONS: Readonly<GameOptions> = {
  wind: 'standard',
  walls: 'random',
  crumble: 50,
  tanksFall: true,
  explosionsKill: true,
  visibleShot: true,
  shotTrail: true,
};

interface WindProfile {
  /** Typical winds fall in [0, base], skewed toward calm. */
  base: number;
  gustChance: number;
  /** Gusts fall in [base, gust]. */
  gust: number;
}

/**
 * From the original's help text: Standard is usually 0–100 with gusts up to ~800, High has
 * more 100–600 winds, and Gale "can exceed ten thousand".
 */
const WIND_PROFILES: Record<WindLevel, WindProfile> = {
  none: { base: 0, gustChance: 0, gust: 0 },
  low: { base: 30, gustChance: 0, gust: 30 },
  standard: { base: 100, gustChance: 0.06, gust: 800 },
  high: { base: 300, gustChance: 0.2, gust: 900 },
  gale: { base: 1500, gustChance: 0.2, gust: 12000 },
};

export function resolveWindLevel(rng: Rng, level: WindLevel | 'random'): WindLevel {
  return level === 'random' ? rng.pick(WIND_LEVELS) : level;
}

/** Rolls a signed integer wind for one round. */
export function rollWind(rng: Rng, level: WindLevel): number {
  const p = WIND_PROFILES[level];
  if (p.base === 0) return 0;
  const sign = rng.chance(0.5) ? 1 : -1;
  const magnitude = rng.chance(p.gustChance)
    ? rng.range(p.base, p.gust)
    : p.base * rng.float() ** 1.5;
  return sign * Math.round(magnitude);
}

export function resolveWalls(rng: Rng, mode: WallMode): boolean {
  return mode === 'random' ? rng.chance(0.5) : mode === 'on';
}
