import type { AiId } from '../ai/registry';
import { DEFAULT_OPTIONS, type GameOptions } from '../sim/options';

export const BACKGROUNDS = [
  'none',
  'stars',
  'bars',
  'circles',
  'spreading',
  'blue',
  'random',
] as const;
export type Background = (typeof BACKGROUNDS)[number];

export const BACKGROUND_NAMES: Record<Background, string> = {
  none: 'None',
  stars: 'Starry Sky',
  bars: 'Color Bars',
  circles: 'Circles',
  spreading: 'Spreading',
  blue: 'Blue Sky',
  random: 'Random',
};

export const MOTION_PREFS = ['auto', 'full', 'reduced'] as const;
export type MotionPref = (typeof MOTION_PREFS)[number];

/** Everything chosen on the main menu: sim options plus set and presentation settings. */
export interface Settings extends GameOptions {
  sound: boolean;
  flySound: boolean;
  /** Master volume, 0–10. */
  volume: number;
  background: Background;
  /** Background animation speed, 0 = still, 10 = fastest. */
  backgroundSpeed: number;
  /** Reduced motion: follow the system setting, or force full/reduced. */
  motion: MotionPref;
  screenShake: boolean;
  gamesPerSet: number;
  players: number;
  computersBuy: boolean;
}

/** Defaults follow the original manual. */
export const DEFAULT_SETTINGS: Readonly<Settings> = {
  ...DEFAULT_OPTIONS,
  sound: true,
  flySound: false,
  volume: 7,
  background: 'random',
  backgroundSpeed: 8,
  motion: 'auto',
  screenShake: true,
  gamesPerSet: 10,
  players: 2,
  computersBuy: true,
};

export type PlayerKind = 'human' | 'computer';

export interface PlayerSlot {
  name: string;
  kind: PlayerKind;
  ai: AiId;
}

export const MAX_PLAYERS = 10;
export const MAX_NAME_LENGTH = 12;

export function defaultSlots(): PlayerSlot[] {
  return Array.from({ length: MAX_PLAYERS }, (_, i) => ({
    name: `Player ${i + 1}`,
    kind: i === 0 ? 'human' : 'computer',
    ai: 'stupid',
  }));
}

export function gameOptionsOf(s: Settings): GameOptions {
  return {
    wind: s.wind,
    walls: s.walls,
    crumble: s.crumble,
    tanksFall: s.tanksFall,
    explosionsKill: s.explosionsKill,
    visibleShot: s.visibleShot,
    shotTrail: s.shotTrail,
  };
}
