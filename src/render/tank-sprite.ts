import { TANK_HALF_WIDTH } from '../sim/tank';

/** Player colors, indexed by `Tank.color`. Chosen to stay distinct on every theme. */
export const PLAYER_COLORS: readonly string[] = [
  '#ff4848',
  '#4a8cff',
  '#46e04a',
  '#ffd430',
  '#e55cff',
  '#3fe6e6',
  '#ff9a30',
  '#f2f2f2',
  '#ff86b6',
  '#a8ff3e',
];

// 15×6 tank, rows from y-6 to y-1. H = highlight, h = hull, D = tread, w = wheel.
const ART = [
  '     hHHHh     ',
  '    hhhhhhh    ',
  ' HHHHHHHHHHHHH ',
  'hhhhhhhhhhhhhhh',
  'DwDwDwDwDwDwDwD',
  ' DDDDDDDDDDDDD ',
];
export const SPRITE_HEIGHT = ART.length;

const cache = new Map<string, HTMLCanvasElement>();

/** Returns a cached tank body sprite for a player color. Draw it at (x - 7, y - 6). */
export function tankSprite(color: string): HTMLCanvasElement {
  const hit = cache.get(color);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = TANK_HALF_WIDTH * 2 + 1;
  canvas.height = ART.length;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  const palette: Record<string, string> = {
    H: lighten(color, 0.45),
    h: color,
    D: '#26262e',
    w: '#7a7a8c',
  };
  ART.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = palette[row[x]!];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  cache.set(color, canvas);
  return canvas;
}

export function lighten(hex: string, t: number): string {
  const v = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((v >> s) & 0xff) + (255 - ((v >> s) & 0xff)) * t);
  return `rgb(${ch(16)} ${ch(8)} ${ch(0)})`;
}

export function darken(hex: string, t: number): string {
  const v = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((v >> s) & 0xff) * (1 - t));
  return `rgb(${ch(16)} ${ch(8)} ${ch(0)})`;
}

/**
 * A tank's body color for its health: the player color darkening toward black as it's hurt,
 * as in the original. Quantized to 5% steps so the sprite cache stays small.
 */
export function healthColor(hex: string, health: number): string {
  const k = Math.max(0, Math.min(100, Math.round(health / 5) * 5)) / 100;
  const v = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((v >> s) & 0xff) * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
