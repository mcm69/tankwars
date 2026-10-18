import type { Command } from '../sim/round';
import { HOLD_DELAY, repeatStep, type InputEvent, type UiAction } from './events';

interface Held {
  ticks: number;
}

/**
 * Turns keyboard state into per-tick input events. A tap is a single unit step; holding an
 * arrow repeats every tick after a short delay, accelerating for power. Holding Shift disables
 * auto-repeat (fine control, like the original's Alt).
 *
 * Aim: ←/→ tilt · ↑/↓ power ±1 · PgUp/PgDn ±100 · I flip · Space/Enter fire
 * Gear: Tab/Shift+Tab weapon · H/V guidance
 * Game: 1–9,0 player status · Esc/P pause · F1/? help · S sound · K mass kill · Q quit
 */
export class KeyboardController {
  private readonly held = new Map<string, Held>();
  private readonly queue: InputEvent[] = [];
  private shift = false;
  private readonly abort = new AbortController();

  constructor(target: Window = window) {
    const opts = { signal: this.abort.signal };
    target.addEventListener('keydown', (e) => this.onKeyDown(e), opts);
    target.addEventListener(
      'keyup',
      (e) => {
        this.held.delete(e.code);
        this.shift = e.shiftKey;
      },
      opts,
    );
    target.addEventListener('blur', () => this.held.clear(), opts);
  }

  /** Removes all listeners. */
  dispose(): void {
    this.abort.abort();
  }

  /** Events for this tick: queued presses plus auto-repeat from held arrows. */
  poll(): InputEvent[] {
    const out = this.queue.splice(0);
    if (this.shift) return out;
    for (const [code, h] of this.held) {
      h.ticks++;
      if (h.ticks < HOLD_DELAY) continue;
      const step = repeatStep(h.ticks);
      const cmd = repeatCommand(code, step);
      if (cmd) out.push({ kind: 'command', cmd });
    }
    return out;
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.shift = e.shiftKey;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // Don't steal keys from form fields (e.g. the dev options panel).
    if (
      typeof HTMLElement !== 'undefined' &&
      e.target instanceof HTMLElement &&
      e.target.closest('input, select, textarea')
    )
      return;
    const mapped = mapKey(e.code, e.key, e.shiftKey);
    if (mapped || e.code === 'Tab' || e.code === 'F1') e.preventDefault();
    if (e.repeat) return; // we do our own repeat, tied to sim ticks
    if (isAnswerKey(e.code)) this.queue.push({ kind: 'key', code: e.code });
    if (!mapped) return;
    this.queue.push(mapped);
    if (e.code.startsWith('Arrow')) this.held.set(e.code, { ticks: 0 });
  }
}

/** Keys that can answer or dismiss an overlay (modifiers and dev F-keys excluded). */
function isAnswerKey(code: string): boolean {
  if (/^(Shift|Control|Alt|Meta|CapsLock)/.test(code)) return false;
  return !/^F([2-9]|1[0-2])$/.test(code);
}

function repeatCommand(code: string, step: number): Command | null {
  switch (code) {
    case 'ArrowLeft':
      return { type: 'aim', delta: 1 };
    case 'ArrowRight':
      return { type: 'aim', delta: -1 };
    case 'ArrowUp':
      return { type: 'power', delta: step };
    case 'ArrowDown':
      return { type: 'power', delta: -step };
    default:
      return null;
  }
}

function mapKey(code: string, key: string, shift: boolean): InputEvent | null {
  const cmd = (c: Command): InputEvent => ({ kind: 'command', cmd: c });
  const ui = (a: UiAction): InputEvent => ({ kind: 'ui', action: a });
  const digit = /^Digit(\d)$/.exec(code);
  if (digit) {
    const n = Number(digit[1]);
    return ui({ type: 'status', tankId: n === 0 ? 9 : n - 1 });
  }
  if (key === '?') return ui({ type: 'help' });
  switch (code) {
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown':
      return cmd(repeatCommand(code, 1)!);
    case 'PageUp':
      return cmd({ type: 'power', delta: 100 });
    case 'PageDown':
      return cmd({ type: 'power', delta: -100 });
    case 'KeyI':
      return cmd({ type: 'flip' });
    case 'Space':
    case 'Enter':
    case 'NumpadEnter':
      return cmd({ type: 'fire' });
    case 'Tab':
      return cmd({ type: 'cycleWeapon', dir: shift ? -1 : 1 });
    case 'KeyH':
      return ui({ type: 'guidance', axis: 'H' });
    case 'KeyV':
      return ui({ type: 'guidance', axis: 'V' });
    case 'Escape':
    case 'KeyP':
      return ui({ type: 'pause' });
    case 'F1':
      return ui({ type: 'help' });
    case 'KeyS':
      return ui({ type: 'sound' });
    case 'KeyK':
      return ui({ type: 'massKill' });
    case 'KeyQ':
      return ui({ type: 'quit' });
    default:
      return null;
  }
}
