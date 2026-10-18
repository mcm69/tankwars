import { describe, expect, it } from 'vitest';
import { itemIndex, ITEMS, LEAD_BALL } from '../src/sim/items';
import { Round, type RoundEvent } from '../src/sim/round';

const players = (n: number, inventory?: number[]) =>
  Array.from({ length: n }, (_, i) => ({
    name: `P${i}`,
    color: i,
    ...(inventory ? { inventory } : {}),
  }));

function ready(round: Round): Round {
  while (round.phase !== 'aiming') round.tick();
  return round;
}

function resolve(round: Round): RoundEvent[] {
  const events: RoundEvent[] = [];
  let guard = 0;
  do {
    round.tick();
    events.push(...round.drainEvents());
  } while (round.phase !== 'aiming' && round.phase !== 'roundOver' && guard++ < 20_000);
  return events;
}

const calm = { wind: 0, walls: false, options: { crumble: 0 } } as const;

describe('Round weapon commands', () => {
  it('only arms weapons the tank owns', () => {
    const round = ready(new Round({ seed: 1, players: players(2), ...calm }));
    const t = round.current!;
    expect(round.command({ type: 'selectWeapon', index: itemIndex('nuke5mt') })).toBe(false);
    expect(round.command({ type: 'selectWeapon', index: itemIndex('grenade') })).toBe(true);
    expect(t.selected).toBe(itemIndex('grenade'));
    expect(round.command({ type: 'selectWeapon', index: 19 })).toBe(false); // guidance, not a weapon
  });

  it('cycles weapons with cycleWeapon', () => {
    const round = ready(new Round({ seed: 1, players: players(2), ...calm }));
    const t = round.current!;
    round.command({ type: 'cycleWeapon', dir: 1 });
    expect(t.selected).toBe(itemIndex('grenade'));
    round.command({ type: 'cycleWeapon', dir: -1 });
    expect(t.selected).toBe(itemIndex('incinerator'));
  });

  it('firing spends ammo and moves on when a weapon runs out', () => {
    const inv = new Array(ITEMS.length).fill(0);
    inv[itemIndex('incinerator')] = 1;
    inv[LEAD_BALL] = 5;
    const round = ready(new Round({ seed: 3, players: players(2, inv), ...calm }));
    const t = round.current!;
    round.command({ type: 'fire' });
    expect(round.projectile?.weapon).toBe(itemIndex('incinerator'));
    expect(t.inventory[itemIndex('incinerator')]).toBe(0);
    expect(t.selected).toBe(LEAD_BALL);
  });

  it('falls back to a Lead Ball when nothing is left', () => {
    const inv = new Array(ITEMS.length).fill(0);
    const round = ready(new Round({ seed: 3, players: players(2, inv), ...calm }));
    expect(round.command({ type: 'fire' })).toBe(true);
    expect(round.projectile?.weapon).toBe(LEAD_BALL);
  });

  it('a Lead Ball is harmless: no crater, no damage', () => {
    const round = ready(new Round({ seed: 4, players: players(2), ...calm }));
    const me = round.current!;
    round.command({ type: 'selectWeapon', index: LEAD_BALL });
    // Straight up at zero power: it lands right back on the shooter.
    round.command({ type: 'setAim', angle: 90 });
    round.command({ type: 'setPower', power: 0 });
    const before = Uint8Array.from(round.terrain.cells);
    round.command({ type: 'fire' });
    const events = resolve(round);
    expect(events).toContainEqual(expect.objectContaining({ type: 'explode', harmless: true }));
    expect(events.some((e) => e.type === 'tankHit')).toBe(false);
    expect(me.health).toBe(100);
    expect(round.terrain.cells).toEqual(before);
  });

  it('setAim and setPower set absolute values, clamped', () => {
    const round = ready(new Round({ seed: 1, players: players(2), ...calm }));
    const t = round.current!;
    round.command({ type: 'setAim', angle: 200 });
    expect(t.angle).toBe(180);
    round.command({ type: 'setAim', angle: 33.4 });
    expect(t.angle).toBe(33);
    t.health = 40;
    round.command({ type: 'setPower', power: 999 });
    expect(t.power).toBe(400);
  });
});

describe('mass kill', () => {
  it('kills everyone once the current turn resolves', () => {
    const round = ready(new Round({ seed: 6, players: players(3), ...calm }));
    expect(round.command({ type: 'massKill' })).toBe(true);
    expect(round.command({ type: 'massKill' })).toBe(false); // already pending
    expect(round.tanks.every((t) => t.alive)).toBe(true);
    round.command({ type: 'selectWeapon', index: LEAD_BALL });
    round.command({ type: 'fire' });
    const events = resolve(round);
    expect(round.phase).toBe('roundOver');
    expect(events.filter((e) => e.type === 'tankDied')).toHaveLength(3);
    expect(round.winnerId).toBeNull();
  });

  it('is refused once the round is over', () => {
    const round = ready(new Round({ seed: 6, players: players(2), ...calm }));
    round.command({ type: 'massKill' });
    round.command({ type: 'fire' });
    resolve(round);
    expect(round.command({ type: 'massKill' })).toBe(false);
  });
});
