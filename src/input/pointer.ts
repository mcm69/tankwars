import { LAYOUT } from '../config';
import type { Screen } from '../render/screen';
import { hudHitTest, type HudId } from '../render/hud-layout';
import { GUIDANCE_H, GUIDANCE_V, WEAPON_COUNT } from '../sim/items';
import type { Command, Round } from '../sim/round';
import { hitsTank, maxPower, TURRET_PIVOT } from '../sim/tank';
import { aimFromPointer } from './aim';
import { capturePointer, HOLD_DELAY, repeatStep, type InputEvent } from './events';

/** Pixels a press may move and still count as a click (not a drag). */
const CLICK_SLOP = 4;

type Press =
  | { kind: 'hud'; id: HudId; ticks: number; button: number }
  | { kind: 'aim'; startX: number; startY: number; moved: boolean; tankId: number }
  | { kind: 'tank'; tankId: number; startX: number; startY: number };

/**
 * Mouse/touch input via Pointer Events: HUD buttons (with hold-to-repeat), clicking tanks for
 * status, drag-to-aim from the current tank, and the wheel for fine power.
 */
export class PointerController {
  hover: HudId | null = null;
  /** Field-space pointer position while drag-aiming, for the aim preview line. */
  aimPreview: { x: number; y: number } | null = null;
  private press: Press | null = null;
  private readonly queue: InputEvent[] = [];
  private readonly abort = new AbortController();

  constructor(
    private readonly screen: Screen,
    private readonly getRound: () => Round,
    /** True while an overlay is open: clicks go to the overlay instead. */
    private readonly overlayOpen: () => boolean,
  ) {
    const c = screen.canvas;
    const opts = { signal: this.abort.signal };
    c.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
    c.addEventListener('pointerdown', (e) => this.down(e), opts);
    c.addEventListener('pointermove', (e) => this.move(e), opts);
    c.addEventListener('pointerup', (e) => this.up(e), opts);
    c.addEventListener('pointercancel', () => this.cancel(), opts);
    c.addEventListener(
      'pointerleave',
      () => {
        this.hover = null;
      },
      opts,
    );
    c.addEventListener('wheel', (e) => this.wheel(e), {
      passive: false,
      signal: this.abort.signal,
    });
  }

  /** Removes all listeners. */
  dispose(): void {
    this.abort.abort();
  }

  get pressed(): HudId | null {
    return this.press?.kind === 'hud' ? this.press.id : null;
  }

  poll(): InputEvent[] {
    const out = this.queue.splice(0);
    const p = this.press;
    if (p?.kind === 'hud') {
      p.ticks++;
      if (p.ticks >= HOLD_DELAY) {
        const cmd = repeatable(p.id, repeatStep(p.ticks));
        if (cmd) out.push({ kind: 'command', cmd });
      }
    }
    return out;
  }

  private logical(e: PointerEvent) {
    return this.screen.toLogical(e.clientX, e.clientY);
  }

  private down(e: PointerEvent): void {
    const { x, y } = this.logical(e);
    capturePointer(this.screen.canvas, e.pointerId);
    if (this.overlayOpen()) {
      this.queue.push({ kind: 'overlayClick', x, y });
      return;
    }
    if (!this.screen.inCore(x, y)) return; // the touch side panels handle their own taps
    this.queue.push({ kind: 'click', x, y });
    const id = hudHitTest(x, y);
    if (id) {
      this.press = { kind: 'hud', id, ticks: 0, button: e.button };
      this.hudPress(id, e.button === 2 || e.shiftKey);
      return;
    }
    const { field } = LAYOUT;
    const fx = x - field.x;
    const fy = y - field.y;
    const round = this.getRound();
    const tank = round.tanks.find((t) => t.alive && near(t, fx, fy));
    const cur = round.current;
    const canAim = round.phase === 'aiming' && !!cur?.alive;
    if (tank && !(canAim && tank.id === cur?.id)) {
      this.press = { kind: 'tank', tankId: tank.id, startX: x, startY: y };
    } else if (canAim && cur) {
      this.press = { kind: 'aim', startX: x, startY: y, moved: false, tankId: cur.id };
      // Starting a drag on empty ground aims right away; on your own tank it waits for a move.
      if (!tank) this.aimAt(fx, fy);
    }
  }

  private move(e: PointerEvent): void {
    const { x, y } = this.logical(e);
    this.hover = hudHitTest(x, y);
    const p = this.press;
    if (p?.kind !== 'aim') return;
    if (!p.moved && Math.hypot(x - p.startX, y - p.startY) > CLICK_SLOP) p.moved = true;
    if (p.moved) this.aimAt(x - LAYOUT.field.x, y - LAYOUT.field.y);
  }

  private up(e: PointerEvent): void {
    const { x, y } = this.logical(e);
    const p = this.press;
    this.press = null;
    this.aimPreview = null;
    if (!p) return;
    const clicked =
      (p.kind === 'tank' || p.kind === 'aim') &&
      Math.hypot(x - p.startX, y - p.startY) <= CLICK_SLOP;
    if (p.kind === 'tank' && clicked) {
      this.queue.push({ kind: 'ui', action: { type: 'status', tankId: p.tankId } });
    }
    // A click (no drag) on your own tank shows your status too.
    const round = this.getRound();
    if (
      p.kind === 'aim' &&
      clicked &&
      near(round.tanks[p.tankId]!, x - LAYOUT.field.x, y - LAYOUT.field.y)
    ) {
      this.queue.push({ kind: 'ui', action: { type: 'status', tankId: p.tankId } });
    }
  }

  private cancel(): void {
    this.press = null;
    this.aimPreview = null;
  }

  private wheel(e: WheelEvent): void {
    e.preventDefault();
    if (this.overlayOpen() || e.deltaY === 0) return;
    const step = e.shiftKey ? 10 : 1;
    this.queue.push({
      kind: 'command',
      cmd: { type: 'power', delta: e.deltaY < 0 ? step : -step },
    });
  }

  private aimAt(fx: number, fy: number): void {
    const round = this.getRound();
    const t = round.current;
    if (!t) return;
    const aim = aimFromPointer(t.x, t.y - TURRET_PIVOT, fx, fy, maxPower(t));
    this.aimPreview = { x: fx, y: fy };
    this.queue.push({ kind: 'command', cmd: { type: 'setAim', angle: aim.angle } });
    this.queue.push({ kind: 'command', cmd: { type: 'setPower', power: aim.power } });
  }

  private hudPress(id: HudId, alt: boolean): void {
    const cmd = (c: Command) => this.queue.push({ kind: 'command', cmd: c });
    const ui = (a: InputEvent & { kind: 'ui' }) => this.queue.push(a);
    if (id.startsWith('slot:')) {
      const i = Number(id.slice(5));
      if (i < WEAPON_COUNT) cmd({ type: 'selectWeapon', index: i });
      else if (i === GUIDANCE_H) ui({ kind: 'ui', action: { type: 'guidance', axis: 'H' } });
      else if (i === GUIDANCE_V) ui({ kind: 'ui', action: { type: 'guidance', axis: 'V' } });
      return;
    }
    switch (id) {
      case 'powerLabel':
        cmd({ type: 'power', delta: alt ? -100 : 100 });
        break;
      case 'flip':
        cmd({ type: 'flip' });
        break;
      case 'fire':
        cmd({ type: 'fire' });
        break;
      case 'help':
        ui({ kind: 'ui', action: { type: 'help' } });
        break;
      case 'pause':
        ui({ kind: 'ui', action: { type: 'pause' } });
        break;
      case 'sound':
        ui({ kind: 'ui', action: { type: 'sound' } });
        break;
      case 'shield':
        break;
      default: {
        const c = repeatable(id, 1);
        if (c) cmd(c);
      }
    }
  }
}

function repeatable(id: HudId, step: number): Command | null {
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

/** Tank hit test with a few pixels of slack, for clicking and touch. */
function near(t: Parameters<typeof hitsTank>[0], fx: number, fy: number): boolean {
  for (const [dx, dy] of [
    [0, 0],
    [3, 0],
    [-3, 0],
    [0, 3],
    [0, -3],
  ] as const) {
    if (hitsTank(t, fx + dx, fy + dy)) return true;
  }
  return false;
}
