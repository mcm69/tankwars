import type { Rng } from '../core/rng';
import { behaviorOf, LASER_MIN_ENERGY } from '../sim/weapons';
import type { Command, Round } from '../sim/round';
import { maxPower } from '../sim/tank';

/** The original's computer opponents, plus "Random" (picks one per set). */
export const AI_IDS = [
  'random',
  'stupid',
  'lobber',
  'rifleman',
  'windlessWit',
  'lobAndShoot',
  'twanger',
] as const;
export type AiId = (typeof AI_IDS)[number];

export const AI_NAMES: Record<AiId, string> = {
  random: 'Random',
  stupid: 'Mr. Stupid',
  lobber: 'Lobber',
  rifleman: 'Rifleman',
  windlessWit: 'Windless Wit',
  lobAndShoot: 'Lob & Shoot',
  twanger: 'Twanger',
};

/** One-line threat summaries from the original manual, shown in player setup. */
export const AI_BLURBS: Record<AiId, string> = {
  random: 'Any of the six, chosen at the start of the set',
  stupid: 'No threat',
  lobber: 'A threat if rebound is off',
  rifleman: 'A threat if below you',
  windlessWit: 'A threat if there is little wind',
  lobAndShoot: 'Almost always a threat',
  twanger: 'Very dangerous if walls bounce',
};

/** Resolves "random" to a concrete personality. */
export function resolveAi(id: AiId, rng: Rng): Exclude<AiId, 'random'> {
  if (id !== 'random') return id;
  return rng.pick(AI_IDS.filter((a) => a !== 'random')) as Exclude<AiId, 'random'>;
}

/**
 * Plans a computer player's turn as a list of commands ending in `fire`.
 *
 * Stage 6 stub: every personality plays like Mr. Stupid (random aim and power, any direction).
 * Stage 8 implements the real strategies.
 */
export function planTurn(_ai: Exclude<AiId, 'random'>, round: Round, rng: Rng): Command[] {
  const t = round.current;
  if (!t) return [];
  const cmds: Command[] = [];
  // Don't try to fire a laser without enough energy.
  if (behaviorOf(t.selected).kind === 'laser' && t.inventory[t.selected]! < LASER_MIN_ENERGY) {
    cmds.push({ type: 'cycleWeapon', dir: 1 });
  }
  cmds.push({ type: 'setAim', angle: rng.int(10, 170) });
  cmds.push({ type: 'setPower', power: rng.int(150, Math.max(150, maxPower(t))) });
  cmds.push({ type: 'fire' });
  return cmds;
}
