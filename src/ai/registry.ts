import type { Rng } from '../core/rng';
import type { Command, Round } from '../sim/round';
import { MAX_HEALTH } from '../sim/constants';
import { TRICK_SHOT_POWER } from '../sim/weapons';
import {
  birdyBonker,
  lobAndShoot,
  lobber,
  rifleman,
  stupid,
  twanger,
  windlessWit,
  type AiContext,
  type AiMemory,
  type AiPlan,
} from './strategies';

export type { AiMemory, AiPlan } from './strategies';

/** The original's six computer opponents, Birdy Bonker (new), and "Random". */
export const AI_IDS = [
  'random',
  'stupid',
  'lobber',
  'rifleman',
  'windlessWit',
  'lobAndShoot',
  'twanger',
  'birdyBonker',
] as const;
export type AiId = (typeof AI_IDS)[number];
export type ConcreteAi = Exclude<AiId, 'random'>;

/** "Random" picks one of the original six. */
export const ORIGINAL_AIS: readonly ConcreteAi[] = [
  'stupid',
  'lobber',
  'rifleman',
  'windlessWit',
  'lobAndShoot',
  'twanger',
];

export const AI_NAMES: Record<AiId, string> = {
  random: 'Random',
  stupid: 'Mr. Stupid',
  lobber: 'Lobber',
  rifleman: 'Rifleman',
  windlessWit: 'Windless Wit',
  lobAndShoot: 'Lob & Shoot',
  twanger: 'Twanger',
  birdyBonker: 'Birdy Bonker',
};

/** One-line threat summaries (from the original manual), shown in player setup. */
export const AI_BLURBS: Record<AiId, string> = {
  random: 'One of the original six, chosen at the start of the set',
  stupid: 'No threat',
  lobber: 'A threat if rebound is off',
  rifleman: 'A threat if below you',
  windlessWit: 'A threat if there is little wind',
  lobAndShoot: 'Almost always a threat',
  twanger: 'Very dangerous if walls bounce',
  birdyBonker: 'New: reads the wind and the walls. Deadly',
};

const STRATEGIES: Record<ConcreteAi, (ctx: AiContext) => AiPlan> = {
  stupid,
  lobber,
  rifleman,
  windlessWit,
  lobAndShoot,
  twanger,
  birdyBonker,
};

/** Resolves "random" to a concrete personality. */
export function resolveAi(id: AiId, rng: Rng): ConcreteAi {
  return id === 'random' ? rng.pick(ORIGINAL_AIS) : id;
}

/** Decides a computer player's shot. Returns null if it isn't that tank's turn. */
export function planTurn(ai: ConcreteAi, round: Round, rng: Rng, memory: AiMemory): AiPlan | null {
  const me = round.current;
  if (!me?.alive || round.phase !== 'aiming') return null;
  const plan = STRATEGIES[ai]({ round, me, rng, memory });
  // Computers don't know the 800-power trick shot; keep them from stumbling into it.
  if (plan && me.health === MAX_HEALTH && plan.power === TRICK_SHOT_POWER) plan.power -= 1;
  return plan;
}

/** The commands that carry out a plan immediately (headless play and tests). */
export function planCommands(plan: AiPlan): Command[] {
  return [
    { type: 'selectWeapon', index: plan.weapon },
    { type: 'setAim', angle: plan.angle },
    { type: 'setPower', power: plan.power },
    { type: 'fire' },
  ];
}

/**
 * Plays a computer's turn on the spot. If the planned weapon can't fire (e.g. not enough laser
 * energy), falls back to a Lead Ball so the game never stalls.
 */
export function playTurnNow(ai: ConcreteAi, round: Round, rng: Rng, memory: AiMemory): boolean {
  const plan = planTurn(ai, round, rng, memory);
  if (!plan) return false;
  for (const cmd of planCommands(plan)) round.command(cmd);
  if (round.phase === 'aiming') {
    round.command({ type: 'selectWeapon', index: 0 });
    round.command({ type: 'fire' });
  }
  return true;
}
