import type { Rect } from '../config';
import type { Screen } from '../render/screen';
import type { Command } from '../sim/round';
import { capturePointer, HOLD_DELAY, repeatStep, type InputEvent } from './events';

export type TouchId =
  | 'angleLeft'
  | 'angleRight'
  | 'powerDown'
  | 'powerUp'
  | 'flip'
  | 'pause'
  | 'weaponPrev'
  | 'weaponNext'
  | 'guidanceH'
  | 'guidanceV'
  | 'fire';

const PAD = 6;

/**
 * Big touch buttons in the side panels (whole-canvas coordinates). Left: aim. Right: weapon,
 * guidance, FIRE. `sw` is the side panel width, `coreW` the core width.
 */
export function touchLayout(sw: number, coreW: number): Record<TouchId, Rect> {
  const half = (sw - 3 * PAD) / 2;
  const full = sw - 2 * PAD;
  const R = sw + coreW; // right panel's left edge
  return {
    angleLeft: { x: PAD, y: 84, w: half, h: 54 },
    angleRight: { x: 2 * PAD + half, y: 84, w: half, h: 54 },
    powerDown: { x: PAD, y: 168, w: half, h: 54 },
    powerUp: { x: 2 * PAD + half, y: 168, w: half, h: 54 },
    flip: { x: PAD, y: 236, w: full, h: 40 },
    pause: { x: PAD, y: 346, w: full, h: 40 },
    weaponPrev: { x: R + PAD, y: 84, w: 26, h: 54 },
    weaponNext: { x: R + sw - PAD - 26, y: 84, w: 26, h: 54 },
    guidanceH: { x: R + PAD, y: 150, w: half, h: 40 },
    guidanceV: { x: R + 2 * PAD + half, y: 150, w: half, h: 40 },
    fire: { x: R + PAD, y: 206, w: full, h: 120 },
  };
}

const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

function repeatable(id: TouchId, step: number): Command | null {
  switch (id) {
    case 'angleLeft':
      return { type: 'aim', delta: 1 };
    case 'angleRight':
      return { type: 'aim', delta: -1 };
    case 'powerUp':
      return { type: 'power', delta: step };
    case 'powerDown':
      return { type: 'power', delta: -step };
    default:
      return null;
  }
}

/**
 * Multi-touch input for the side panels: each finger can hold its own button (e.g. angle and
 * power at once), with the same hold-to-repeat as the keyboard.
 */
export class TouchControls {
  private readonly held = new Map<number, { id: TouchId; ticks: number }>();
  private readonly queue: InputEvent[] = [];
  private readonly abort = new AbortController();

  constructor(
    private readonly screen: Screen,
    private readonly overlayOpen: () => boolean,
  ) {
    const opts = { signal: this.abort.signal };
    const c = screen.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e), opts);
    const release = (e: PointerEvent) => this.held.delete(e.pointerId);
    c.addEventListener('pointerup', release, opts);
    c.addEventListener('pointercancel', release, opts);
  }

  get layout(): Record<TouchId, Rect> {
    return touchLayout(this.screen.sideWidth, this.screen.width - 2 * this.screen.sideWidth);
  }

  /** Buttons currently held down (for drawing them pressed). */
  get pressed(): Set<TouchId> {
    return new Set([...this.held.values()].map((h) => h.id));
  }

  poll(): InputEvent[] {
    const out = this.queue.splice(0);
    for (const h of this.held.values()) {
      h.ticks++;
      if (h.ticks < HOLD_DELAY) continue;
      const cmd = repeatable(h.id, repeatStep(h.ticks));
      if (cmd) out.push({ kind: 'command', cmd });
    }
    return out;
  }

  private down(e: PointerEvent): void {
    const p = this.screen.toCanvas(e.clientX, e.clientY);
    const core = this.screen.toLogical(e.clientX, e.clientY);
    if (this.screen.inCore(core.x, core.y)) return; // the core's own controllers handle it
    if (this.overlayOpen()) {
      this.queue.push({ kind: 'overlayClick', x: core.x, y: core.y });
      return;
    }
    this.queue.push({ kind: 'click', x: core.x, y: core.y });
    const id = (Object.entries(this.layout) as [TouchId, Rect][]).find(([, r]) =>
      inside(r, p.x, p.y),
    )?.[0];
    if (!id) return;
    capturePointer(this.screen.canvas, e.pointerId);
    this.held.set(e.pointerId, { id, ticks: 0 });
    this.press(id);
  }

  private press(id: TouchId): void {
    const cmd = (c: Command): void => {
      this.queue.push({ kind: 'command', cmd: c });
    };
    switch (id) {
      case 'flip':
        return cmd({ type: 'flip' });
      case 'fire':
        return cmd({ type: 'fire' });
      case 'weaponPrev':
        return cmd({ type: 'cycleWeapon', dir: -1 });
      case 'weaponNext':
        return cmd({ type: 'cycleWeapon', dir: 1 });
      case 'pause':
        this.queue.push({ kind: 'ui', action: { type: 'pause' } });
        return;
      case 'guidanceH':
      case 'guidanceV':
        this.queue.push({
          kind: 'ui',
          action: { type: 'guidance', axis: id === 'guidanceH' ? 'H' : 'V' },
        });
        return;
      default: {
        const c = repeatable(id, 1);
        if (c) cmd(c);
      }
    }
  }

  dispose(): void {
    this.abort.abort();
  }
}
