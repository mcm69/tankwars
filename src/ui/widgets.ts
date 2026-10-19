import type { Rect } from '../config';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../config';
import { drawText, drawTextShadow, textWidth } from '../render/font';
import type { UiEvent } from '../input/ui-input';

export const UI = {
  bg: '#0d0818',
  panel: '#160f24',
  panelHi: '#2a1840',
  border: '#c050ff',
  label: '#b58cff',
  value: '#ffe74a',
  text: '#d8d0e8',
  dim: '#7a6f98',
  accent: '#ff3a6a',
} as const;

export const inside = (r: Rect, x: number, y: number) =>
  x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

/** Full-screen backdrop for menu scenes: dark gradient with a faint pixel grid. */
export function backdrop(ctx: CanvasRenderingContext2D): void {
  const g = ctx.createLinearGradient(0, 0, 0, LOGICAL_HEIGHT);
  g.addColorStop(0, '#120a24');
  g.addColorStop(1, '#05030a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  ctx.fillStyle = 'rgb(192 80 255 / 6%)';
  for (let x = 0; x < LOGICAL_WIDTH; x += 16) ctx.fillRect(x, 0, 1, LOGICAL_HEIGHT);
  for (let y = 0; y < LOGICAL_HEIGHT; y += 16) ctx.fillRect(0, y, LOGICAL_WIDTH, 1);
}

export function panel(ctx: CanvasRenderingContext2D, r: Rect, title?: string): void {
  ctx.fillStyle = UI.panel;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = UI.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  if (title) {
    ctx.fillStyle = UI.panelHi;
    ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 20);
    drawText(ctx, title, r.x + r.w / 2, r.y + 4, '#ffffff', 2, 'center');
  }
}

export function heading(ctx: CanvasRenderingContext2D, text: string, y = 14): void {
  drawTextShadow(ctx, text, LOGICAL_WIDTH / 2, y, UI.border, 3, 'center', '#2a0a40');
}

export interface ButtonStyle {
  hover?: boolean;
  primary?: boolean;
  disabled?: boolean;
  scale?: number;
}

export function button(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  { hover = false, primary = false, disabled = false, scale = 2 }: ButtonStyle = {},
): void {
  const fill = disabled
    ? '#1e1830'
    : primary
      ? hover
        ? '#d8343a'
        : '#b02428'
      : hover
        ? '#3a2f52'
        : '#2a2238';
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = '#5a4e78';
  ctx.fillRect(r.x, r.y, r.w, 1);
  ctx.fillRect(r.x, r.y, 1, r.h);
  ctx.fillStyle = '#0c0812';
  ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
  const h = 7 * scale;
  drawText(
    ctx,
    label,
    r.x + r.w / 2,
    r.y + (r.h - h) / 2,
    disabled ? UI.dim : '#ffffff',
    scale,
    'center',
  );
}

/** A menu row: a label and a value that can be stepped left/right, or an action. */
export interface MenuItem {
  readonly id: string;
  label: string;
  value?: () => string;
  change?: (dir: 1 | -1) => void;
  activate?: () => void;
  /** Extra line shown at the bottom of the menu while this row is selected. */
  help?: string;
  /** A section heading: drawn as a title and skipped by the cursor. */
  header?: boolean;
}

/**
 * Vertical option list in the spirit of the original's main menu: Up/Down move the cursor,
 * Left/Right change the value, Enter activates. Mouse: click a row's ◀ ▶ (or left/right-click
 * its value) to change it; the wheel works too.
 */
export class MenuList {
  selected = 0;
  hover = -1;

  constructor(
    readonly items: MenuItem[],
    readonly x: number,
    readonly y: number,
    readonly w: number,
    readonly rowH = 18,
  ) {
    this.selected = this.step(-1, 1);
  }

  /** Next selectable row from `from` in direction `dir`, wrapping around. */
  private step(from: number, dir: 1 | -1): number {
    const n = this.items.length;
    for (let k = 1; k <= n; k++) {
      const i = (((from + dir * k) % n) + n) % n;
      if (!this.items[i]!.header) return i;
    }
    return from;
  }

  /** Moves the cursor to the row with this id (if it exists and is selectable). */
  select(id: string): void {
    const i = this.items.findIndex((it) => it.id === id && !it.header);
    if (i >= 0) this.selected = i;
  }

  rowRect(i: number): Rect {
    return { x: this.x, y: this.y + i * this.rowH, w: this.w, h: this.rowH - 2 };
  }

  private arrows(i: number): { left: Rect; right: Rect } {
    const r = this.rowRect(i);
    return {
      left: { x: r.x + r.w - 150, y: r.y, w: 16, h: r.h },
      right: { x: r.x + r.w - 18, y: r.y, w: 16, h: r.h },
    };
  }

  private rowAt(x: number, y: number): number {
    for (let i = 0; i < this.items.length; i++) {
      if (!this.items[i]!.header && inside(this.rowRect(i), x, y)) return i;
    }
    return -1;
  }

  /** Handles an input event; returns true if consumed. */
  handle(e: UiEvent): boolean {
    const item = this.items[this.selected];
    switch (e.type) {
      case 'key':
        if (e.code === 'ArrowUp') this.selected = this.step(this.selected, -1);
        else if (e.code === 'ArrowDown') this.selected = this.step(this.selected, 1);
        else if (e.code === 'ArrowLeft') item?.change?.(-1);
        else if (e.code === 'ArrowRight') item?.change?.(1);
        else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
          if (item?.activate) item.activate();
          else item?.change?.(1);
        } else return false;
        return true;
      case 'move':
        this.hover = this.rowAt(e.x, e.y);
        return false;
      case 'wheel': {
        const i = this.rowAt(e.x, e.y);
        if (i < 0) return false;
        this.selected = i;
        this.items[i]?.change?.(e.dir);
        return true;
      }
      case 'click': {
        const i = this.rowAt(e.x, e.y);
        if (i < 0) return false;
        this.selected = i;
        const it = this.items[i]!;
        if (it.activate) {
          it.activate();
          return true;
        }
        const { left, right } = this.arrows(i);
        if (inside(left, e.x, e.y)) it.change?.(-1);
        else if (inside(right, e.x, e.y) || e.x > left.x) it.change?.(e.button === 2 ? -1 : 1);
        return true;
      }
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    this.items.forEach((it, i) => {
      const r = this.rowRect(i);
      if (it.header) {
        const ty = r.y + r.h - 8;
        drawText(ctx, it.label, r.x + 4, ty, UI.border);
        ctx.fillStyle = UI.border;
        ctx.globalAlpha = 0.4;
        ctx.fillRect(r.x + 8 + textWidth(it.label), ty + 3, r.w - 12 - textWidth(it.label), 1);
        ctx.globalAlpha = 1;
        return;
      }
      const sel = i === this.selected;
      if (sel || i === this.hover) {
        ctx.fillStyle = sel ? '#2a1840' : '#1c1430';
        ctx.fillRect(r.x, r.y, r.w, r.h);
      }
      const ty = r.y + (r.h - 7) / 2;
      // The original marked the current option with an asterisk.
      if (sel) drawText(ctx, '*', r.x + 4, ty, UI.accent);
      if (it.activate) {
        // Big labels need room; in tight lists actions are centered at normal size.
        const scale = this.rowH >= 20 ? 2 : 1;
        drawText(
          ctx,
          it.label,
          r.x + r.w / 2,
          r.y + (r.h - 7 * scale) / 2,
          sel ? '#ffffff' : UI.value,
          scale,
          'center',
        );
        return;
      }
      drawText(ctx, it.label, r.x + 16, ty, sel ? '#ffffff' : UI.label);
      if (it.value) {
        const { left, right } = this.arrows(i);
        drawText(ctx, '◀', left.x + 5, ty, sel ? UI.value : UI.dim);
        drawText(ctx, '▶', right.x + 6, ty, sel ? UI.value : UI.dim);
        const v = it.value();
        drawText(ctx, v, (left.x + 16 + right.x) / 2, ty, UI.value, 1, 'center');
      }
    });
    const help = this.items[this.selected]?.help;
    if (help) {
      const y = this.y + this.items.length * this.rowH + 6;
      drawText(ctx, help, this.x + this.w / 2, y, UI.dim, 1, 'center');
    }
  }
}

/** Width helper re-exported for scene layout code. */
export { textWidth };
