import { describe, expect, it } from 'vitest';
import { AI_IDS, AI_NAMES } from '../src/ai/registry';
import { GameSet, roundScore, SCORE_FOR_WIN, SCORE_PER_KILL } from '../src/game/set';
import { DEFAULT_SETTINGS, defaultSlots, type Settings } from '../src/game/settings';
import { itemIndex, LEAD_BALL } from '../src/sim/items';
import type { Round } from '../src/sim/round';

const settings = (s: Partial<Settings> = {}): Settings => ({
  ...DEFAULT_SETTINGS,
  wind: 'none',
  walls: 'off',
  crumble: 0,
  ...s,
});

function untilAiming(round: Round): void {
  let g = 0;
  while (round.phase !== 'aiming' && round.phase !== 'roundOver' && g++ < 20_000) round.tick();
}

/** Ends a round quickly: the current player triggers a mass kill and fires a Lead Ball. */
function massKillRound(round: Round): void {
  untilAiming(round);
  round.command({ type: 'massKill' });
  round.command({ type: 'selectWeapon', index: LEAD_BALL });
  round.command({ type: 'fire' });
  untilAiming(round);
}

describe('GameSet', () => {
  it('takes as many slots as there are players, with stable colors', () => {
    const set = new GameSet(settings({ players: 3 }), defaultSlots(), 1);
    expect(set.players.map((p) => p.color)).toEqual([0, 1, 2]);
    expect(set.players.map((p) => p.kind)).toEqual(['human', 'computer', 'computer']);
  });

  it('resolves Random computers to a concrete personality, deterministically', () => {
    const slots = defaultSlots().map((s) => ({
      ...s,
      kind: 'computer' as const,
      ai: 'random' as const,
    }));
    const a = new GameSet(settings({ players: 10 }), slots, 7);
    const b = new GameSet(settings({ players: 10 }), slots, 7);
    expect(a.players.map((p) => p.ai)).toEqual(b.players.map((p) => p.ai));
    for (const p of a.players) {
      expect(p.ai).not.toBe('random');
      expect(AI_IDS).toContain(p.ai);
    }
  });

  it('names a "Random" computer after the personality it turned out to be', () => {
    const slots = defaultSlots();
    slots[1] = { name: 'Random', kind: 'computer', ai: 'random' };
    slots[2] = { name: 'Bob', kind: 'computer', ai: 'random' };
    const set = new GameSet(settings({ players: 3 }), slots, 11);
    const [, random, bob] = set.players;
    expect(random!.name).toBe(AI_NAMES[random!.ai!]);
    expect(random!.name).not.toBe('Random');
    expect(bob!.name).toBe('Bob');
  });

  it('starts everyone with the per-set inventory', () => {
    const set = new GameSet(settings({ gamesPerSet: 5 }), defaultSlots(), 1);
    expect(set.players[0]!.inventory[itemIndex('incinerator')]).toBe(15);
    expect(set.players[0]!.inventory[itemIndex('grenade')]).toBe(50);
  });

  it('plays the configured number of rounds, then finishes', () => {
    const set = new GameSet(settings({ gamesPerSet: 3 }), defaultSlots(), 3);
    const seeds = new Set<number>();
    while (!set.finished) {
      seeds.add(set.roundSeed());
      const round = set.startRound();
      massKillRound(round);
      expect(round.phase).toBe('roundOver');
      set.finishRound(round);
    }
    expect(set.roundsPlayed).toBe(3);
    expect(seeds.size).toBe(3); // a different battlefield each game
    expect(() => set.startRound()).toThrow();
  });

  it('carries inventories between rounds', () => {
    const set = new GameSet(settings({ gamesPerSet: 2 }), defaultSlots(), 4);
    const round = set.startRound();
    untilAiming(round);
    const shooter = round.currentId;
    round.command({ type: 'massKill' });
    round.command({ type: 'selectWeapon', index: itemIndex('grenade') });
    round.command({ type: 'fire' });
    untilAiming(round);
    set.finishRound(round);
    expect(set.players[shooter]!.inventory[itemIndex('grenade')]).toBe(19);
    const next = set.startRound();
    expect(next.tanks[shooter]!.inventory[itemIndex('grenade')]).toBe(19);
  });

  it('scores damage, kills and wins, and ranks the standings', () => {
    expect(roundScore({ damageDealt: 120, selfDamage: 20, kills: 1, killedBy: null }, true)).toBe(
      100 + SCORE_PER_KILL + SCORE_FOR_WIN,
    );
    const set = new GameSet(settings({ gamesPerSet: 1 }), defaultSlots(), 5);
    const round = set.startRound();
    untilAiming(round);
    // Fake a decisive round: player 0 destroys player 1.
    round.stats[0]!.damageDealt = 100;
    round.stats[0]!.kills = 1;
    round.phase = 'roundOver';
    round.winnerId = 0;
    set.finishRound(round);
    expect(set.players[0]!.score).toBe(100 + SCORE_PER_KILL + SCORE_FOR_WIN);
    expect(set.players[0]!.wins).toBe(1);
    expect(set.standings()[0]!.index).toBe(0);
    expect(set.lastWinner).toBe(0);
  });
});

describe('Round stats', () => {
  it('credits damage and kills to the player whose turn it is; mass kills credit nobody', () => {
    const set = new GameSet(settings({ players: 3 }), defaultSlots(), 9);
    const round = set.startRound();
    untilAiming(round);
    const me = round.currentId;
    const other = round.tanks.find((t) => t.id !== me)!.id;
    round.damage(other, 30);
    round.damage(me, 5);
    expect(round.stats[me]).toMatchObject({ damageDealt: 30, selfDamage: 5 });
    massKillRound(round);
    expect(round.stats.every((s) => s.kills === 0)).toBe(true);
    expect(round.stats.every((s) => s.killedBy === -1)).toBe(true);
  });
});
