import { resolveAi, type ConcreteAi } from '../ai/registry';
import { Rng } from '../core/rng';
import { aiShoppingList } from '../ai/buy';
import { purchase, roundIncome } from './economy';
import { startingInventory } from '../sim/items';
import { Round, type RoundStats } from '../sim/round';
import { gameOptionsOf, type PlayerKind, type PlayerSlot, type Settings } from './settings';

export interface SetPlayer {
  readonly index: number;
  readonly name: string;
  readonly color: number;
  readonly kind: PlayerKind;
  /** Concrete personality for computers ("random" resolved at set start). */
  readonly ai: ConcreteAi | null;
  /** Carried from round to round. */
  inventory: number[];
  score: number;
  /** Dollars to spend in the shop. */
  money: number;
  wins: number;
  kills: number;
}

/** Points per round (provisional; Stage 7 settles scoring and money). */
export const SCORE_PER_KILL = 150;
export const SCORE_FOR_WIN = 300;

export function roundScore(s: RoundStats, won: boolean): number {
  return s.damageDealt - s.selfDamage + SCORE_PER_KILL * s.kills + (won ? SCORE_FOR_WIN : 0);
}

/**
 * A set of N rounds between the same players. Owns what persists across rounds: inventories,
 * scores, wins. Deterministic for a given seed.
 */
export class GameSet {
  readonly players: SetPlayer[];
  readonly settings: Readonly<Settings>;
  readonly seed: number;
  /** Rounds completed so far. */
  roundsPlayed = 0;
  round: Round | null = null;
  /** Score gained by each player in the last finished round. */
  lastRoundScores: number[] = [];
  /** Money earned by each player in the last finished round. */
  lastRoundIncome: number[] = [];
  lastWinner: number | null = null;

  constructor(
    settings: Settings,
    slots: readonly PlayerSlot[],
    seed: number,
    /** Overrides the starting inventory (dev arsenal, tests). */
    startInventory?: readonly number[],
    /** Starting money (dev/tests; normally 0). */
    startMoney = 0,
  ) {
    this.settings = { ...settings };
    this.seed = seed >>> 0;
    const aiRng = new Rng(this.seed ^ 0xa1a1);
    const inventory = startInventory ?? startingInventory(settings.gamesPerSet);
    this.players = slots.slice(0, settings.players).map((slot, index) => ({
      index,
      name: slot.name.trim() || `Player ${index + 1}`,
      color: index,
      kind: slot.kind,
      ai: slot.kind === 'computer' ? resolveAi(slot.ai, aiRng) : null,
      inventory: [...inventory],
      score: 0,
      money: startMoney,
      wins: 0,
      kills: 0,
    }));
  }

  get totalRounds(): number {
    return this.settings.gamesPerSet;
  }

  get finished(): boolean {
    return this.roundsPlayed >= this.totalRounds;
  }

  get allComputers(): boolean {
    return this.players.every((p) => p.kind === 'computer');
  }

  /** Seed for a round; also used by presentation for its own (theme) choices. */
  roundSeed(n = this.roundsPlayed): number {
    return (this.seed + (n + 1) * 0x9e3779b1) >>> 0;
  }

  startRound(): Round {
    if (this.finished) throw new Error('Set is over');
    this.round = new Round({
      seed: this.roundSeed(),
      players: this.players.map((p) => ({ name: p.name, color: p.color, inventory: p.inventory })),
      options: gameOptionsOf(this.settings),
    });
    return this.round;
  }

  /** Tallies a finished round into the set. */
  finishRound(round: Round): void {
    if (round.phase !== 'roundOver') throw new Error('Round is not over');
    this.lastWinner = round.winnerId;
    this.lastRoundScores = round.stats.map((s, i) => roundScore(s, round.winnerId === i));
    this.lastRoundIncome = this.lastRoundScores.map(roundIncome);
    this.players.forEach((p, i) => {
      p.score += this.lastRoundScores[i]!;
      p.money += this.lastRoundIncome[i]!;
      p.kills += round.stats[i]!.kills;
      if (round.winnerId === i) p.wins++;
      p.inventory = [...round.tanks[i]!.inventory];
    });
    this.roundsPlayed++;
    this.round = null;
  }

  /**
   * Computer players spend their money (when the setting allows). Deterministic per game.
   * Returns what each computer bought, by player index, for display.
   */
  computersShop(): Map<number, number[]> {
    const bought = new Map<number, number[]>();
    if (!this.settings.computersBuy) return bought;
    const rng = new Rng(this.roundSeed() ^ 0xb0b);
    for (const p of this.players) {
      if (p.kind !== 'computer' || !p.ai) continue;
      const cart = aiShoppingList(p.ai, p.money, p.inventory, rng);
      p.money = purchase(p.inventory, p.money, cart);
      if (cart.some((n) => n > 0)) bought.set(p.index, cart);
    }
    return bought;
  }

  /** Players by score (then wins), best first. */
  standings(): SetPlayer[] {
    return [...this.players].sort(
      (a, b) => b.score - a.score || b.wins - a.wins || a.index - b.index,
    );
  }
}
