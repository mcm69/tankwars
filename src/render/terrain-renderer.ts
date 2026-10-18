import { Material, type Terrain } from '../sim/terrain';
import { packColor, type TerrainTheme } from './themes';

/** Stable per-pixel noise in [0, 255]: gives dirt texture without storing colors. */
function hash2(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  return (h ^ (h >>> 13)) & 0xff;
}

/**
 * Draws the terrain into an offscreen canvas, updating only the terrain's dirty rect.
 * Air pixels are transparent so the sky (or an animated background) shows through.
 */
export class TerrainRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly pixels: Uint32Array;
  private dirt: Uint32Array = new Uint32Array(0);
  private edge: [number, number] = [0, 0];

  constructor(
    private readonly width: number,
    private readonly height: number,
    theme: TerrainTheme,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.image = ctx.createImageData(width, height);
    this.pixels = new Uint32Array(this.image.data.buffer);
    this.setTheme(theme);
  }

  /** Changes colors. The caller should mark the whole terrain dirty to repaint. */
  setTheme(theme: TerrainTheme): void {
    this.dirt = Uint32Array.from(theme.dirt, packColor);
    this.edge = [packColor(theme.edge[0]), packColor(theme.edge[1])];
  }

  /** Repaints whatever changed in `terrain` since the last call. Returns true if anything did. */
  update(terrain: Terrain): boolean {
    const d = terrain.takeDirty();
    if (!d) return false;
    // A change can expose or cover ground below it, which changes the 2-px edge highlight.
    const x0 = Math.max(0, d.x0);
    const x1 = Math.min(this.width - 1, d.x1);
    const y0 = Math.max(0, d.y0);
    const y1 = Math.min(this.height - 1, d.y1 + 2);
    this.paint(terrain, x0, y0, x1, y1);
    this.ctx.putImageData(this.image, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    return true;
  }

  private paint(terrain: Terrain, x0: number, y0: number, x1: number, y1: number): void {
    const { cells } = terrain;
    const { width, height, pixels, dirt, edge } = this;
    const bands = dirt.length;
    for (let y = y0; y <= y1; y++) {
      // Depth bands by absolute row, dithered at the boundaries with per-pixel noise.
      const bandF = (y / height) * bands;
      for (let x = x0; x <= x1; x++) {
        const i = y * width + x;
        if (cells[i] === Material.Air) {
          pixels[i] = 0;
          continue;
        }
        if (y === 0 || cells[i - width] === Material.Air) {
          pixels[i] = edge[0];
          continue;
        }
        if (y === 1 || cells[i - 2 * width] === Material.Air) {
          pixels[i] = edge[1];
          continue;
        }
        const n = hash2(x, y);
        let band = Math.floor(bandF + (n / 255 - 0.5) * 0.9);
        // Sparse speckles of a lighter shade for texture.
        if (n > 247) band -= 1;
        pixels[i] = dirt[Math.min(bands - 1, Math.max(0, band))]!;
      }
    }
  }
}

/** Renders a banded vertical sky gradient once into a canvas. */
export function renderSky(width: number, height: number, theme: TerrainTheme): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const stops = theme.sky;
  const bands = 24;
  const bandH = height / bands;
  for (let b = 0; b < bands; b++) {
    const t = (b / (bands - 1)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(t));
    ctx.fillStyle = mix(stops[i]!, stops[i + 1]!, t - i);
    ctx.fillRect(0, Math.floor(b * bandH), width, Math.ceil(bandH) + 1);
  }
  return canvas;
}

function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) =>
    Math.round(((pa >> shift) & 0xff) * (1 - t) + ((pb >> shift) & 0xff) * t);
  return `rgb(${ch(16)} ${ch(8)} ${ch(0)})`;
}
