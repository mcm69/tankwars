import type { Screen } from '../render/screen';

export type UiEvent =
  | { type: 'key'; code: string; key: string; shift: boolean; repeat: boolean }
  | { type: 'click'; x: number; y: number; button: number }
  | { type: 'move'; x: number; y: number }
  | { type: 'wheel'; x: number; y: number; dir: 1 | -1 };

/**
 * Raw keyboard and pointer input for menu-style scenes, in logical canvas coordinates.
 * Keys typed into a focused text field are left alone.
 */
export class UiInput {
  /** Last pointer position (logical), or null when the pointer left the canvas. */
  pointer: { x: number; y: number } | null = null;
  private readonly queue: UiEvent[] = [];
  private readonly abort = new AbortController();

  constructor(screen: Screen) {
    const opts = { signal: this.abort.signal };
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.target instanceof HTMLInputElement) return;
        if (/^(Arrow|Tab|Space|Enter|PageUp|PageDown|F1$)/.test(e.code)) e.preventDefault();
        this.queue.push({
          type: 'key',
          code: e.code,
          key: e.key,
          shift: e.shiftKey,
          repeat: e.repeat,
        });
      },
      opts,
    );
    const c = screen.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault(), opts);
    c.addEventListener(
      'pointerdown',
      (e) => {
        const p = screen.toLogical(e.clientX, e.clientY);
        this.pointer = p;
        this.queue.push({ type: 'click', x: p.x, y: p.y, button: e.button });
      },
      opts,
    );
    c.addEventListener(
      'pointermove',
      (e) => {
        const p = screen.toLogical(e.clientX, e.clientY);
        this.pointer = p;
        this.queue.push({ type: 'move', x: p.x, y: p.y });
      },
      opts,
    );
    c.addEventListener('pointerleave', () => (this.pointer = null), opts);
    c.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        if (e.deltaY === 0) return;
        const p = screen.toLogical(e.clientX, e.clientY);
        this.queue.push({ type: 'wheel', x: p.x, y: p.y, dir: e.deltaY < 0 ? 1 : -1 });
      },
      { passive: false, signal: this.abort.signal },
    );
  }

  poll(): UiEvent[] {
    return this.queue.splice(0);
  }

  dispose(): void {
    this.abort.abort();
  }
}
