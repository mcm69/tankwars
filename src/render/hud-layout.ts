import type { Rect } from '../config';
import { STRIP_ITEMS } from '../sim/items';

/**
 * Geometry of the HUD band (logical canvas pixels), shared by the HUD renderer and the pointer
 * controller so what you see is exactly what you can click.
 */

export const ROW_A = 4;
export const ROW_B = 22;
export const STRIP_Y = 42;
export const SLOT_W = 24;
export const SLOT_H = 19;
export const SLOT_PITCH = 25;

export type HudId =
  | 'angleLeft'
  | 'angleRight'
  | 'flip'
  | 'powerLabel'
  | 'powerDown'
  | 'powerUp'
  | 'fire'
  | 'shield'
  | 'help'
  | 'pause'
  | 'sound'
  | `slot:${number}`;

export const HUD_RECTS: Readonly<Record<Exclude<HudId, `slot:${number}`>, Rect>> = {
  angleLeft: { x: 72, y: ROW_A - 1, w: 14, h: 16 },
  angleRight: { x: 136, y: ROW_A - 1, w: 14, h: 16 },
  flip: { x: 154, y: ROW_A - 1, w: 18, h: 16 },
  powerLabel: { x: 8, y: ROW_B - 1, w: 60, h: 16 },
  powerDown: { x: 72, y: ROW_B - 1, w: 14, h: 16 },
  powerUp: { x: 136, y: ROW_B - 1, w: 14, h: 16 },
  fire: { x: 560, y: 3, w: 72, h: 34 },
  shield: { x: 513, y: STRIP_Y, w: SLOT_W, h: SLOT_H },
  help: { x: 545, y: STRIP_Y, w: SLOT_W, h: SLOT_H },
  pause: { x: 572, y: STRIP_Y, w: SLOT_W, h: SLOT_H },
  sound: { x: 599, y: STRIP_Y, w: 33, h: SLOT_H },
};

/** Right edge of the angle/power value text. */
export const VALUE_RIGHT = 131;
export const NAME_X = 184;
export const MEN_X = 340;
export const BADGE_RECT: Rect = { x: 340, y: ROW_B - 1, w: 16, h: 16 };
export const WEAPON_LABEL_X = 362;

export function slotRect(i: number): Rect {
  return { x: 8 + i * SLOT_PITCH, y: STRIP_Y, w: SLOT_W, h: SLOT_H };
}

const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Which interactive HUD element (if any) is at logical point (x, y). */
export function hudHitTest(x: number, y: number): HudId | null {
  for (const [id, r] of Object.entries(HUD_RECTS)) if (inside(r, x, y)) return id as HudId;
  for (let i = 0; i < STRIP_ITEMS; i++) if (inside(slotRect(i), x, y)) return `slot:${i}`;
  return null;
}
