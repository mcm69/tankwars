import { FIELD_WIDTH, MAX_HEALTH, POWER_PER_HEALTH } from './constants';
import { itemIndex, ITEMS, startingInventory, WEAPON_COUNT } from './items';
import type { Terrain } from './terrain';

/** Tank footprint relative to its base point (x, y): the base row is just above the ground. */
export const TANK_HALF_WIDTH = 7;
export const TANK_HEIGHT = 7;
/** Turret pivot height above the base. */
export const TURRET_PIVOT = 6;
export const BARREL_LENGTH = 10;
/** Columns either side of x that must have ground under them for the tank to be supported. */
const SUPPORT_HALF_WIDTH = 5;

export interface Tank {
  readonly id: number;
  readonly name: string;
  /** Index into the presentation's player color table. */
  readonly color: number;
  /** Base center; the tank occupies rows y-TANK_HEIGHT .. y-1. */
  x: number;
  y: number;
  /** Aim in degrees: 0 = right, 90 = up, 180 = left. */
  angle: number;
  power: number;
  health: number;
  alive: boolean;
  /** Count owned of each item, indexed like ITEMS. */
  inventory: number[];
  /** Index of the armed weapon (always a weapon index). */
  selected: number;
  /** Guidance armed for the next shot, if any. */
  guidance: { axis: 'H' | 'V'; targetId: number } | null;
}

export function createTank(
  id: number,
  name: string,
  color: number,
  x: number,
  y: number,
  inventory: readonly number[] = startingInventory(),
): Tank {
  const inv = [...inventory];
  while (inv.length < ITEMS.length) inv.push(0);
  const preferred = itemIndex('incinerator');
  const tank: Tank = {
    id,
    name,
    color,
    x,
    y,
    angle: x < FIELD_WIDTH / 2 ? 45 : 135,
    power: 400,
    health: MAX_HEALTH,
    alive: true,
    inventory: inv,
    selected: preferred,
    guidance: null,
  };
  if (inv[preferred]! <= 0) tank.selected = nextOwnedWeapon(tank, preferred, 1);
  return tank;
}

/**
 * The next weapon after `from` in direction `dir` that the tank owns, wrapping around.
 * Returns `from` if nothing else is owned.
 */
export function nextOwnedWeapon(t: Tank, from: number, dir: 1 | -1): number {
  for (let i = 1; i <= WEAPON_COUNT; i++) {
    const idx = (((from + dir * i) % WEAPON_COUNT) + WEAPON_COUNT) % WEAPON_COUNT;
    if (t.inventory[idx]! > 0) return idx;
  }
  return from;
}

export function maxPower(t: Tank): number {
  return Math.max(0, Math.round(t.health * POWER_PER_HEALTH));
}

export function barrelTip(t: Tank): { x: number; y: number } {
  const a = (t.angle * Math.PI) / 180;
  return {
    x: t.x + Math.cos(a) * BARREL_LENGTH,
    y: t.y - TURRET_PIVOT - Math.sin(a) * BARREL_LENGTH,
  };
}

/** Center used for blast-distance calculations. */
export function tankCenter(t: Tank): { x: number; y: number } {
  return { x: t.x, y: t.y - TANK_HEIGHT / 2 };
}

export function hitsTank(t: Tank, x: number, y: number): boolean {
  return (
    t.alive &&
    x >= t.x - TANK_HALF_WIDTH &&
    x <= t.x + TANK_HALF_WIDTH &&
    y >= t.y - TANK_HEIGHT &&
    y <= t.y
  );
}

export function isSupported(t: Tank, terrain: Terrain): boolean {
  if (t.y >= terrain.height) return true; // resting on the field floor
  const gx = Math.round(t.x);
  const gy = Math.floor(t.y);
  for (let dx = -SUPPORT_HALF_WIDTH; dx <= SUPPORT_HALF_WIDTH; dx++) {
    if (terrain.isSolid(gx + dx, gy)) return true;
  }
  return false;
}

/** Angle as shown to players: degrees above horizontal (0–90) plus a facing. */
export function displayAngle(angle: number): { degrees: number; facing: 'left' | 'right' | 'up' } {
  const a = Math.round(angle);
  if (a === 90) return { degrees: 90, facing: 'up' };
  return a < 90 ? { degrees: a, facing: 'right' } : { degrees: 180 - a, facing: 'left' };
}
