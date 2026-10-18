import { AI_IDS, type AiId, type ConcreteAi } from '../ai/registry';
import {
  BACKGROUNDS,
  DEFAULT_SETTINGS,
  defaultSlots,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  type PlayerSlot,
  type Settings,
} from '../game/settings';
import { ITEMS } from '../sim/items';
import { WIND_LEVELS } from '../sim/options';

/**
 * Versioned localStorage persistence. Every value is stored as `{ v, data }`. Loading never
 * throws: unreadable, corrupt or unknown-version data falls back to defaults, and each field
 * is validated on its own, so a save from an older version keeps whatever is still valid.
 */

export const SAVE_VERSION = 1;
const PREFIX = 'tankwars:';
export const KEYS = { settings: 'settings', slots: 'slots', set: 'set' } as const;

/** Minimal key-value store (localStorage, or an in-memory map in tests). */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStore implements KeyValueStore {
  readonly map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

/** localStorage if usable (it can throw in private modes or when disabled), else memory. */
export function browserStore(): KeyValueStore {
  try {
    const ls = window.localStorage;
    const probe = `${PREFIX}probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return new MemoryStore();
  }
}

/**
 * Upgrades from older save versions, keyed by the version they upgrade *from*. Version 1 is
 * the first, so this is empty; add `1: (data) => …` when the format changes.
 */
const MIGRATIONS: Record<number, (data: unknown) => unknown> = {};

export class Storage {
  constructor(private readonly store: KeyValueStore) {}

  private read(key: string): unknown {
    try {
      const raw = this.store.getItem(PREFIX + key);
      if (raw === null) return undefined;
      const env = JSON.parse(raw) as { v?: unknown; data?: unknown };
      if (typeof env !== 'object' || env === null || typeof env.v !== 'number') return undefined;
      let { v } = env;
      let data = env.data;
      if (v > SAVE_VERSION) return undefined; // from a newer version of the game: ignore
      while (v < SAVE_VERSION) {
        const up = MIGRATIONS[v];
        if (!up) return undefined;
        data = up(data);
        v++;
      }
      return data;
    } catch {
      return undefined;
    }
  }

  private write(key: string, data: unknown): void {
    try {
      this.store.setItem(PREFIX + key, JSON.stringify({ v: SAVE_VERSION, data }));
    } catch {
      /* quota or disabled storage: the game still works, it just won't remember */
    }
  }

  remove(key: string): void {
    try {
      this.store.removeItem(PREFIX + key);
    } catch {
      /* ignore */
    }
  }

  loadSettings(): Settings {
    return sanitizeSettings(this.read(KEYS.settings));
  }

  saveSettings(s: Settings): void {
    this.write(KEYS.settings, s);
  }

  loadSlots(): PlayerSlot[] {
    return sanitizeSlots(this.read(KEYS.slots));
  }

  saveSlots(slots: readonly PlayerSlot[]): void {
    this.write(KEYS.slots, slots);
  }

  loadSet(): SetSnapshot | null {
    return sanitizeSet(this.read(KEYS.set));
  }

  saveSet(snap: SetSnapshot): void {
    this.write(KEYS.set, snap);
  }

  clearSet(): void {
    this.remove(KEYS.set);
  }
}

// ------------------------------------------------------------------ validation

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isInt = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const oneOf = <T extends string>(v: unknown, list: readonly T[]): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

export function sanitizeSettings(raw: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (!isObj(raw)) return s;
  for (const key of [
    'sound',
    'flySound',
    'visibleShot',
    'shotTrail',
    'tanksFall',
    'explosionsKill',
    'computersBuy',
  ] as const) {
    if (isBool(raw[key])) s[key] = raw[key];
  }
  if (isInt(raw.volume, 0, 10)) s.volume = raw.volume;
  if (isInt(raw.crumble, 0, 100)) s.crumble = raw.crumble;
  if (isInt(raw.backgroundSpeed, 0, 10)) s.backgroundSpeed = raw.backgroundSpeed;
  if (isInt(raw.gamesPerSet, 1, 99)) s.gamesPerSet = raw.gamesPerSet;
  if (isInt(raw.players, 2, MAX_PLAYERS)) s.players = raw.players;
  if (oneOf(raw.wind, [...WIND_LEVELS, 'random'] as const)) s.wind = raw.wind;
  if (oneOf(raw.walls, ['off', 'on', 'random'] as const)) s.walls = raw.walls;
  if (oneOf(raw.background, BACKGROUNDS)) s.background = raw.background;
  return s;
}

function sanitizeSlot(raw: unknown, fallback: PlayerSlot): PlayerSlot {
  if (!isObj(raw)) return fallback;
  return {
    name:
      typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.slice(0, MAX_NAME_LENGTH)
        : fallback.name,
    kind: oneOf(raw.kind, ['human', 'computer'] as const) ? raw.kind : fallback.kind,
    ai: oneOf(raw.ai, AI_IDS) ? (raw.ai as AiId) : fallback.ai,
  };
}

export function sanitizeSlots(raw: unknown): PlayerSlot[] {
  const defaults = defaultSlots();
  if (!Array.isArray(raw)) return defaults;
  return defaults.map((d, i) => sanitizeSlot(raw[i], d));
}

/** Everything needed to rebuild a set in progress at a round boundary. */
export interface SetSnapshot {
  settings: Settings;
  seed: number;
  roundsPlayed: number;
  /** 'between': the last game finished and shopping is next; 'round': the next game starts. */
  stage: 'between' | 'round';
  lastWinner: number | null;
  lastRoundScores: number[];
  lastRoundIncome: number[];
  players: {
    name: string;
    kind: 'human' | 'computer';
    ai: ConcreteAi | null;
    inventory: number[];
    score: number;
    money: number;
    wins: number;
    kills: number;
  }[];
}

const isIntArray = (v: unknown, len: number): v is number[] =>
  Array.isArray(v) && v.length === len && v.every((n) => Number.isInteger(n));

export function sanitizeSet(raw: unknown): SetSnapshot | null {
  if (!isObj(raw)) return null;
  const settings = sanitizeSettings(raw.settings);
  const n = Array.isArray(raw.players) ? raw.players.length : 0;
  if (n < 2 || n > MAX_PLAYERS || n !== settings.players) return null;
  if (!isInt(raw.seed, 0, 2 ** 32 - 1)) return null;
  if (!isInt(raw.roundsPlayed, 0, settings.gamesPerSet - 1)) return null;
  if (!oneOf(raw.stage, ['between', 'round'] as const)) return null;
  if (raw.stage === 'between' && raw.roundsPlayed === 0) return null;
  const lastWinner =
    raw.lastWinner === null || isInt(raw.lastWinner, 0, n - 1) ? raw.lastWinner : null;
  const players: SetSnapshot['players'] = [];
  for (const p of raw.players as unknown[]) {
    if (!isObj(p)) return null;
    const kind = oneOf(p.kind, ['human', 'computer'] as const) ? p.kind : null;
    const ai =
      p.ai === null
        ? null
        : oneOf(p.ai, AI_IDS) && p.ai !== 'random'
          ? (p.ai as ConcreteAi)
          : undefined;
    if (!kind || ai === undefined || (kind === 'computer') !== (ai !== null)) return null;
    if (typeof p.name !== 'string' || !p.name.trim()) return null;
    if (!isIntArray(p.inventory, ITEMS.length) || p.inventory.some((c) => c < 0)) return null;
    if (!Number.isInteger(p.score) || !isInt(p.money, 0, 1e12)) return null;
    if (!isInt(p.wins, 0, 99) || !isInt(p.kills, 0, 9999)) return null;
    players.push({
      name: p.name.slice(0, MAX_NAME_LENGTH),
      kind,
      ai,
      inventory: p.inventory,
      score: p.score as number,
      money: p.money,
      wins: p.wins,
      kills: p.kills,
    });
  }
  const arr = (v: unknown) => (isIntArray(v, n) ? v : new Array<number>(n).fill(0));
  return {
    settings,
    seed: raw.seed,
    roundsPlayed: raw.roundsPlayed,
    stage: raw.stage,
    lastWinner: lastWinner as number | null,
    lastRoundScores: arr(raw.lastRoundScores),
    lastRoundIncome: arr(raw.lastRoundIncome),
    players,
  };
}
