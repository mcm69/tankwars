/**
 * Per-pixel battlefield material grid. Row 0 is the top of the field. Pure data: rendering
 * reads it (plus the dirty rect) and draws however it likes.
 */

export const Material = {
  Air: 0,
  Dirt: 1,
} as const;
export type Material = (typeof Material)[keyof typeof Material];

/** Inclusive pixel bounds of the area changed since the last takeDirty(). */
export interface DirtyRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export class Terrain {
  readonly cells: Uint8Array;
  private dirty: DirtyRect | null = null;

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.cells = new Uint8Array(width * height);
    this.markDirty(0, 0, width - 1, height - 1);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): Material {
    if (!this.inBounds(x, y)) return Material.Air;
    return this.cells[y * this.width + x] as Material;
  }

  isSolid(x: number, y: number): boolean {
    return this.get(Math.floor(x), Math.floor(y)) !== Material.Air;
  }

  set(x: number, y: number, m: Material): void {
    if (!this.inBounds(x, y)) return;
    const i = y * this.width + x;
    if (this.cells[i] === m) return;
    this.cells[i] = m;
    this.markDirty(x, y, x, y);
  }

  /** Topmost solid row in column x, or `height` if the column is empty. */
  surfaceY(x: number): number {
    if (x < 0 || x >= this.width) return this.height;
    const { cells, width, height } = this;
    for (let y = 0; y < height; y++) if (cells[y * width + x] !== Material.Air) return y;
    return height;
  }

  /** Replaces the whole grid with columns solid from `surface[x]` down to the bottom. */
  fillFromSurface(surface: ArrayLike<number>): void {
    const { cells, width, height } = this;
    for (let x = 0; x < width; x++) {
      const top = Math.max(0, Math.min(height, Math.round(surface[x] ?? height)));
      for (let y = 0; y < height; y++)
        cells[y * width + x] = y >= top ? Material.Dirt : Material.Air;
    }
    this.markDirty(0, 0, width - 1, height - 1);
  }

  /** Sets every cell inside the circle to `m`; returns how many cells changed. */
  paintCircle(cx: number, cy: number, r: number, m: Material): number {
    const { cells, width, height } = this;
    const x0 = Math.max(0, Math.floor(cx - r));
    const x1 = Math.min(width - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r));
    const y1 = Math.min(height - 1, Math.ceil(cy + r));
    const r2 = r * r;
    let changed = 0;
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - cy;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - cx;
        if (dx * dx + dy * dy > r2) continue;
        const i = y * width + x;
        if (cells[i] !== m) {
          cells[i] = m;
          changed++;
        }
      }
    }
    if (changed > 0) this.markDirty(x0, y0, x1, y1);
    return changed;
  }

  /** Removes material in a circle (explosions). Returns cells removed. */
  carveCircle(cx: number, cy: number, r: number): number {
    return this.paintCircle(cx, cy, r, Material.Air);
  }

  /** Adds dirt in a circle, only where there is air (dirt weapons). Returns cells added. */
  fillCircle(cx: number, cy: number, r: number): number {
    return this.paintCircle(cx, cy, r, Material.Dirt);
  }

  markDirty(x0: number, y0: number, x1: number, y1: number): void {
    const d = this.dirty;
    if (!d) {
      this.dirty = { x0, y0, x1, y1 };
      return;
    }
    d.x0 = Math.min(d.x0, x0);
    d.y0 = Math.min(d.y0, y0);
    d.x1 = Math.max(d.x1, x1);
    d.y1 = Math.max(d.y1, y1);
  }

  /** Returns and clears the changed area since the last call. */
  takeDirty(): DirtyRect | null {
    const d = this.dirty;
    this.dirty = null;
    return d;
  }
}
