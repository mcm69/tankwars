import type { Command } from '../sim/round';

/** Ticks a key must be held before it auto-repeats. */
const HOLD_DELAY = 15;

interface Held {
  ticks: number;
}

/**
 * Turns keyboard state into per-tick sim commands. A tap is a single unit step; holding repeats
 * every tick after a short delay, accelerating for power. Holding Shift disables auto-repeat
 * (fine control, like the original's Alt).
 *
 * ←/→ tilt the barrel · ↑/↓ power ±1 · PgUp/PgDn power ±100 · I flip · Space/Enter fire
 */
export class KeyboardController {
  private readonly held = new Map<string, Held>();
  private readonly queue: Command[] = [];
  private shift = false;

  constructor(target: Window = window) {
    target.addEventListener('keydown', (e) => this.onKeyDown(e));
    target.addEventListener('keyup', (e) => {
      this.held.delete(e.code);
      this.shift = e.shiftKey;
    });
    target.addEventListener('blur', () => this.held.clear());
  }

  /** Commands for this tick: queued taps plus auto-repeat from held keys. */
  poll(): Command[] {
    const out = this.queue.splice(0);
    if (this.shift) return out;
    for (const [code, h] of this.held) {
      h.ticks++;
      if (h.ticks < HOLD_DELAY) continue;
      const accel = h.ticks > 90 ? 10 : h.ticks > 45 ? 4 : 1;
      switch (code) {
        case 'ArrowLeft':
          out.push({ type: 'aim', delta: 1 });
          break;
        case 'ArrowRight':
          out.push({ type: 'aim', delta: -1 });
          break;
        case 'ArrowUp':
          out.push({ type: 'power', delta: accel });
          break;
        case 'ArrowDown':
          out.push({ type: 'power', delta: -accel });
          break;
      }
    }
    return out;
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.shift = e.shiftKey;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const cmd = tapCommand(e.code);
    if (!cmd) return;
    e.preventDefault();
    if (e.repeat) return; // we do our own repeat, tied to sim ticks
    this.queue.push(cmd);
    if (e.code.startsWith('Arrow')) this.held.set(e.code, { ticks: 0 });
  }
}

function tapCommand(code: string): Command | null {
  switch (code) {
    case 'ArrowLeft':
      return { type: 'aim', delta: 1 };
    case 'ArrowRight':
      return { type: 'aim', delta: -1 };
    case 'ArrowUp':
      return { type: 'power', delta: 1 };
    case 'ArrowDown':
      return { type: 'power', delta: -1 };
    case 'PageUp':
      return { type: 'power', delta: 100 };
    case 'PageDown':
      return { type: 'power', delta: -100 };
    case 'KeyI':
      return { type: 'flip' };
    case 'Space':
    case 'Enter':
    case 'NumpadEnter':
      return { type: 'fire' };
    default:
      return null;
  }
}
