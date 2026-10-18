import { Rng } from '../core/rng';
import { startingInventory } from '../sim/items';
import type { GameOptions } from '../sim/options';
import { Round } from '../sim/round';
import { AI_NAMES, playTurnNow, type AiMemory, type ConcreteAi } from './registry';

export interface MatchResult {
  /** Index into the lineup of the winner, or null for a draw / nobody left. */
  winner: number | null;
  turns: number;
}

export interface MatchOptions {
  seed: number;
  options?: Partial<GameOptions>;
  /** Turns before the game is called a draw. */
  maxTurns?: number;
  inventory?: readonly number[];
}

/** Plays one game between computer players, headless and as fast as possible. */
export function playMatch(lineup: readonly ConcreteAi[], m: MatchOptions): MatchResult {
  const round = new Round({
    seed: m.seed,
    players: lineup.map((ai, i) => ({
      name: AI_NAMES[ai],
      color: i,
      inventory: m.inventory ?? startingInventory(3),
    })),
    ...(m.options ? { options: m.options } : {}),
  });
  const rng = new Rng(m.seed ^ 0xa1);
  const memory = lineup.map((): AiMemory => ({}));
  const maxTurns = m.maxTurns ?? 120;
  let turns = 0;
  let ticks = 0;
  while (round.phase !== 'roundOver' && turns < maxTurns && ticks < 400_000) {
    if (round.phase === 'aiming') {
      const id = round.currentId;
      playTurnNow(lineup[id]!, round, rng, memory[id]!);
      turns++;
    }
    round.tick();
    ticks++;
  }
  return { winner: round.phase === 'roundOver' ? round.winnerId : null, turns };
}

export interface Standing {
  ai: ConcreteAi;
  wins: number;
  games: number;
}

export interface TournamentReport {
  duel: Standing[];
  ffa: Standing[];
  draws: number;
  /** pairWins[a][b] = games a won against b in duels. */
  pairWins: Map<ConcreteAi, Map<ConcreteAi, number>>;
}

/**
 * Round-robin duels (each pair plays `games` games, swapping seats) and free-for-alls with
 * everyone at once. Deterministic for a given seed.
 */
export function runTournament(
  ais: readonly ConcreteAi[],
  games: number,
  seed: number,
  options: Partial<GameOptions> = {},
  modes: { duel: boolean; ffa: boolean } = { duel: true, ffa: true },
): TournamentReport {
  const duel = new Map(ais.map((a) => [a, { ai: a, wins: 0, games: 0 }]));
  const ffa = new Map(ais.map((a) => [a, { ai: a, wins: 0, games: 0 }]));
  const pairWins = new Map(ais.map((a) => [a, new Map(ais.map((b) => [b, 0]))]));
  let draws = 0;
  let n = 0;
  if (modes.duel) {
    for (let i = 0; i < ais.length; i++) {
      for (let j = i + 1; j < ais.length; j++) {
        for (let g = 0; g < games; g++) {
          const lineup = g % 2 === 0 ? [ais[i]!, ais[j]!] : [ais[j]!, ais[i]!];
          const r = playMatch(lineup, { seed: seed + n++ * 7919, options });
          for (const ai of lineup) duel.get(ai)!.games++;
          if (r.winner === null) draws++;
          else {
            const w = lineup[r.winner]!;
            const l = lineup[1 - r.winner]!;
            duel.get(w)!.wins++;
            pairWins.get(w)!.set(l, pairWins.get(w)!.get(l)! + 1);
          }
        }
      }
    }
  }
  if (modes.ffa) {
    for (let g = 0; g < games; g++) {
      // Rotate seats so nobody always starts in the same slot.
      const lineup = ais.map((_, k) => ais[(k + g) % ais.length]!);
      const r = playMatch(lineup, { seed: seed + n++ * 7919, options, maxTurns: 300 });
      for (const ai of lineup) ffa.get(ai)!.games++;
      if (r.winner === null) draws++;
      else ffa.get(lineup[r.winner]!)!.wins++;
    }
  }
  const sort = (m: Map<ConcreteAi, Standing>) =>
    [...m.values()].sort((a, b) => b.wins / (b.games || 1) - a.wins / (a.games || 1));
  return { duel: sort(duel), ffa: sort(ffa), draws, pairWins };
}
