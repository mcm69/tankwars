import { FIELD_HEIGHT, FIELD_WIDTH } from './sim/constants';

/** Logical resolution of the game canvas (locked in Stage 1). */
export const LOGICAL_WIDTH = 640;
export const LOGICAL_HEIGHT = 400;

/** Simulation ticks per second. The sim only ever advances in whole ticks of this size. */
export const TICK_RATE = 60;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Desktop layout on the logical canvas: HUD band on top, playfield below with a 1-px border
 * drawn just outside it. Mobile may rearrange this in Stage 10; the field size is fixed.
 */
export const LAYOUT: { readonly hud: Rect; readonly field: Rect } = {
  hud: { x: 0, y: 0, w: LOGICAL_WIDTH, h: 64 },
  field: { x: 8, y: 72, w: FIELD_WIDTH, h: FIELD_HEIGHT },
};
