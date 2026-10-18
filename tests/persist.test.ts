import { describe, expect, it } from 'vitest';
import { GameSet } from '../src/game/set';
import { DEFAULT_SETTINGS, defaultSlots, type Settings } from '../src/game/settings';
import {
  MemoryStore,
  SAVE_VERSION,
  sanitizeSet,
  sanitizeSettings,
  sanitizeSlots,
  Storage,
} from '../src/persist/storage';
import { itemIndex, LEAD_BALL } from '../src/sim/items';
import type { Round } from '../src/sim/round';

const settings = (s: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...s });

function playOut(round: Round): void {
  let g = 0;
  while (round.phase !== 'aiming' && g++ < 20_000) round.tick();
  round.command({ type: 'massKill' });
  round.command({ type: 'selectWeapon', index: LEAD_BALL });
  round.command({ type: 'fire' });
  while (round.phase !== 'roundOver' && g++ < 40_000) round.tick();
}

describe('storage', () => {
  it('round-trips settings and player slots', () => {
    const store = new MemoryStore();
    const st = new Storage(store);
    const s = settings({ volume: 3, wind: 'gale', gamesPerSet: 7, players: 4, crumble: 80 });
    st.saveSettings(s);
    const slots = defaultSlots();
    slots[1] = { name: 'Bot', kind: 'computer', ai: 'twanger' };
    st.saveSlots(slots);
    const again = new Storage(store);
    expect(again.loadSettings()).toEqual(s);
    expect(again.loadSlots()[1]).toEqual({ name: 'Bot', kind: 'computer', ai: 'twanger' });
  });

  it('falls back to defaults for missing, corrupt or future-version data', () => {
    const store = new MemoryStore();
    const st = new Storage(store);
    expect(st.loadSettings()).toEqual(DEFAULT_SETTINGS);
    store.setItem('tankwars:settings', '{not json');
    expect(st.loadSettings()).toEqual(DEFAULT_SETTINGS);
    store.setItem(
      'tankwars:settings',
      JSON.stringify({ v: SAVE_VERSION + 1, data: { volume: 1 } }),
    );
    expect(st.loadSettings()).toEqual(DEFAULT_SETTINGS);
    store.setItem('tankwars:set', '"garbage"');
    expect(st.loadSet()).toBeNull();
  });

  it('keeps the valid fields of a damaged or old save', () => {
    const s = sanitizeSettings({
      volume: 4,
      wind: 'tornado',
      crumble: 250,
      players: 3,
      sound: 'yes',
    });
    expect(s.volume).toBe(4);
    expect(s.players).toBe(3);
    expect(s.wind).toBe(DEFAULT_SETTINGS.wind);
    expect(s.crumble).toBe(DEFAULT_SETTINGS.crumble);
    expect(s.sound).toBe(DEFAULT_SETTINGS.sound);
    const slots = sanitizeSlots([{ name: 'A very very long name', kind: 'alien', ai: 'lobber' }]);
    expect(slots[0]!.name).toHaveLength(12);
    expect(slots[0]!.kind).toBe('human');
    expect(slots[0]!.ai).toBe('lobber');
    expect(slots).toHaveLength(10);
  });

  it('survives a store that throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };
    const st = new Storage(broken);
    expect(st.loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(() => st.saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    expect(() => st.clearSet()).not.toThrow();
  });
});

describe('set snapshots', () => {
  it('restore a set that replays the next game identically', () => {
    const slots = defaultSlots().map((s) => ({
      ...s,
      kind: 'computer' as const,
      ai: 'random' as const,
    }));
    const set = new GameSet(settings({ players: 3, gamesPerSet: 4 }), slots, 99);
    const r1 = set.startRound();
    playOut(r1);
    set.finishRound(r1);
    set.players[1]!.money = 12345;
    set.players[2]!.inventory[itemIndex('nuke5mt')] = 3;

    const store = new MemoryStore();
    new Storage(store).saveSet(set.snapshot('round'));
    const snap = new Storage(store).loadSet()!;
    expect(snap.stage).toBe('round');
    const restored = GameSet.restore(snap);

    expect(restored.roundsPlayed).toBe(1);
    expect(restored.players.map((p) => [p.name, p.ai, p.score, p.money, p.wins, p.kills])).toEqual(
      set.players.map((p) => [p.name, p.ai, p.score, p.money, p.wins, p.kills]),
    );
    expect(restored.players[2]!.inventory).toEqual(set.players[2]!.inventory);
    const a = set.startRound();
    const b = restored.startRound();
    expect(b.terrain.cells).toEqual(a.terrain.cells);
    expect(b.wind).toBe(a.wind);
    expect(b.tanks.map((t) => t.x)).toEqual(a.tanks.map((t) => t.x));
  });

  it('rejects snapshots that do not add up', () => {
    const set = new GameSet(settings({ players: 2, gamesPerSet: 3 }), defaultSlots(), 5);
    const good = set.snapshot('round');
    expect(sanitizeSet(JSON.parse(JSON.stringify(good)))).not.toBeNull();
    const bad = (patch: Record<string, unknown>) =>
      sanitizeSet({ ...JSON.parse(JSON.stringify(good)), ...patch });
    expect(bad({ roundsPlayed: 3 })).toBeNull(); // already finished
    expect(bad({ stage: 'between', roundsPlayed: 0 })).toBeNull();
    expect(bad({ players: [good.players[0]] })).toBeNull(); // count mismatch
    expect(
      bad({ players: [{ ...good.players[0], inventory: [1, 2] }, good.players[1]] }),
    ).toBeNull();
    expect(
      bad({ players: [{ ...good.players[0], kind: 'computer', ai: null }, good.players[1]] }),
    ).toBeNull();
    expect(bad({ seed: -1 })).toBeNull();
  });
});
