import { describe, expect, it } from 'vitest';
import { playTurnNow, type AiMemory } from '../src/ai/registry';
import { Rng } from '../src/core/rng';
import { fullInventory } from '../src/sim/items';
import { replayRound } from '../src/sim/replay';
import { Round } from '../src/sim/round';

/** Plays a whole round of computer turns on the spot, logging every command. */
function playRound(seed: number): Round {
  const round = new Round({
    seed,
    players: [0, 1, 2].map((i) => ({ name: `P${i}`, color: i, inventory: fullInventory(3) })),
    options: { walls: 'random', wind: 'high' },
  });
  const rng = new Rng(seed ^ 0xa1);
  const memory = new Map<number, AiMemory>();
  for (let guard = 0; round.phase !== 'roundOver' && guard < 200_000; guard++) {
    if (round.phase === 'aiming') {
      const id = round.current!.id;
      if (!memory.has(id)) memory.set(id, {});
      playTurnNow('lobAndShoot', round, rng, memory.get(id)!);
    }
    round.tick();
  }
  return round;
}

describe('replay', () => {
  it('reproduces a whole round exactly from its config and command log', () => {
    for (const seed of [3, 17]) {
      const original = playRound(seed);
      expect(original.phase).toBe('roundOver');
      expect(original.commandLog.length).toBeGreaterThan(0);
      const copy = replayRound(
        JSON.parse(JSON.stringify(original.config)),
        JSON.parse(JSON.stringify(original.commandLog)),
      );
      expect(copy.phase).toBe('roundOver');
      expect(copy.winnerId).toBe(original.winnerId);
      expect(copy.tanks.map((t) => [t.x, t.y, t.health, t.alive])).toEqual(
        original.tanks.map((t) => [t.x, t.y, t.health, t.alive]),
      );
      expect(Array.from(copy.terrain.cells)).toEqual(Array.from(original.terrain.cells));
    }
  });

  it('stops at a given tick, and keeps the starting config untouched by play', () => {
    const original = playRound(5);
    const mid = original.commandLog[Math.floor(original.commandLog.length / 2)]!.tick;
    const copy = replayRound(original.config, original.commandLog, mid);
    expect(copy.tickCount).toBe(mid);
    // The round mutates its tanks' inventories; the logged config must not change with them.
    expect(original.config.players[0]!.inventory).toEqual(fullInventory(3));
  });

  it('reports a divergent log instead of silently drifting', () => {
    const original = playRound(9);
    const bad = [{ tick: 0, cmd: { type: 'fire' as const } }];
    expect(() => replayRound(original.config, bad)).toThrow(/diverged/);
  });
});
