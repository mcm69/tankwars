import type { Command } from '../sim/round';

/** UI-level actions that don't go to the sim (or need confirmation first). */
export type UiAction =
  | { type: 'pause' }
  | { type: 'help' }
  | { type: 'sound' }
  | { type: 'massKill' }
  | { type: 'quit' }
  | { type: 'guidance'; axis: 'H' | 'V' }
  | { type: 'status'; tankId: number };

/**
 * Everything input devices report to the scene each tick. `key` is sent for every fresh key
 * press (used to answer/dismiss overlays); `overlayClick` for clicks while an overlay is open.
 */
export type InputEvent =
  | { kind: 'command'; cmd: Command }
  | { kind: 'ui'; action: UiAction }
  | { kind: 'key'; code: string }
  | { kind: 'overlayClick'; x: number; y: number };

/** Ticks a key or button must be held before it auto-repeats. */
export const HOLD_DELAY = 15;

/** Auto-repeat step size for a control held for `ticks`: 1, then ×4, then ×10. */
export function repeatStep(ticks: number): number {
  return ticks > 90 ? 10 : ticks > 45 ? 4 : 1;
}
