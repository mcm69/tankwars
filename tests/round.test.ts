import { describe, expect, it } from 'vitest';
import { itemIndex, startingInventory } from '../src/sim/items';
import { Round, type Phase, type RoundEvent } from '../src/sim/round';
import { isSupported } from '../src/sim/tank';

/** Players stocked with plenty of Incinerators, so scripted rounds always have real ammo. */
const players = (n: number) =>
  Array.from({ length: n }, (_, i) => {
    const inventory = startingInventory();
    inventory[itemIndex('incinerator')] = 999;
    return { name: `P${i + 1}`, color: i, inventory };
  });

function tickUntil(round: Round, done: () => boolean, limit = 20_000): RoundEvent[] {
  const events: RoundEvent[] = [];
  for (let i = 0; i < limit && !done(); i++) {
    round.tick();
    events.push(...round.drainEvents());
  }
  if (!done()) throw new Error(`condition not reached in ${limit} ticks (phase ${round.phase})`);
  return events;
}

/** A crude but deterministic shooter: aims roughly at the next tank with a seeded power. */
function playRound(seed: number, n: number): { round: Round; events: RoundEvent[] } {
  const round = new Round({ seed, players: players(n) });
  const events: RoundEvent[] = [];
  let turns = 0;
  while (round.phase !== 'roundOver' && turns < 2000) {
    events.push(...tickUntil(round, () => round.phase === 'aiming' || round.phase === 'roundOver'));
    // tickUntil mutates the round behind TypeScript's back, so re-read the phase untyped.
    if ((round.phase as Phase) === 'roundOver') break;
    const me = round.current!;
    const target = round.tanks.find((t) => t.alive && t.id !== me.id)!;
    // Sweeps a wide range of elevations and powers so some shots eventually connect.
    const elevation = 20 + ((turns * 37) % 60);
    round.command({
      type: 'aim',
      delta: (target.x > me.x ? elevation : 180 - elevation) - me.angle,
    });
    round.command({ type: 'power', delta: 100 + ((turns * 379) % 900) - me.power });
    round.command({ type: 'fire' });
    turns++;
  }
  return { round, events };
}

describe('Round', () => {
  it('drops every tank onto solid ground before the first turn', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const round = new Round({ seed, players: players(4) });
      tickUntil(round, () => round.phase === 'aiming');
      for (const t of round.tanks) {
        expect(isSupported(t, round.terrain)).toBe(true);
        expect(t.y).toBeGreaterThan(0);
        expect(t.y).toBeLessThanOrEqual(round.terrain.height);
      }
    }
  });

  it('spreads tanks across the field', () => {
    const round = new Round({ seed: 3, players: players(5) });
    const xs = round.tanks.map((t) => t.x).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeGreaterThan(40);
  });

  it('rejects commands outside the aiming phase', () => {
    const round = new Round({ seed: 1, players: players(2) });
    expect(round.phase).toBe('dropping');
    expect(round.command({ type: 'fire' })).toBe(false);
  });

  it('clamps angle and power, with power capped by health', () => {
    const round = new Round({ seed: 1, players: players(2) });
    tickUntil(round, () => round.phase === 'aiming');
    const t = round.current!;
    round.command({ type: 'aim', delta: 500 });
    expect(t.angle).toBe(180);
    round.command({ type: 'flip' });
    expect(t.angle).toBe(0);
    t.health = 50;
    round.command({ type: 'power', delta: 5000 });
    expect(t.power).toBe(500);
  });

  it('a tank that shells itself dies and the other player wins', () => {
    const round = new Round({ seed: 2, players: players(2) });
    tickUntil(round, () => round.phase === 'aiming');
    const me = round.currentId;
    round.command({ type: 'aim', delta: 90 - round.current!.angle });
    round.command({ type: 'power', delta: -10_000 });
    round.command({ type: 'fire' });
    const events = tickUntil(round, () => round.phase === 'roundOver');
    expect(events).toContainEqual(expect.objectContaining({ type: 'tankDied', tankId: me }));
    expect(round.winnerId).toBe(1 - me);
  });

  it('takes turns left to right, skipping dead tanks', () => {
    const { round, events } = playRound(11, 4);
    const turns = events.filter((e) => e.type === 'turn').map((e) => e.tankId);
    const dead = new Set<number>();
    let last = -1;
    for (const e of events) {
      if (e.type === 'tankDied') dead.add(e.tankId);
      if (e.type !== 'turn') continue;
      if (last >= 0) {
        // The next living tank in left-to-right order after `last`.
        const i = round.order.indexOf(last);
        let expected = -1;
        for (let k = 1; k <= round.order.length; k++) {
          const c = round.order[(i + k) % round.order.length]!;
          if (!dead.has(c)) {
            expected = c;
            break;
          }
        }
        expect(e.tankId).toBe(expected);
      }
      last = e.tankId;
    }
    expect(turns.length).toBeGreaterThan(1);
  });

  it('ends with at most one survivor', () => {
    for (const seed of [4, 5, 6]) {
      const { round } = playRound(seed, 3);
      expect(round.phase).toBe('roundOver');
      const alive = round.tanks.filter((t) => t.alive);
      expect(alive.length).toBeLessThanOrEqual(1);
      expect(round.winnerId).toBe(alive[0]?.id ?? null);
    }
  });

  it('is deterministic for the same seed and commands', () => {
    const a = playRound(21, 3);
    const b = playRound(21, 3);
    expect(a.events).toEqual(b.events);
    expect(a.round.terrain.cells).toEqual(b.round.terrain.cells);
    expect(a.round.tanks).toEqual(b.round.tanks);
  });
});
