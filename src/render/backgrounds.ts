import { Rng } from '../core/rng';
import type { Background } from '../game/settings';
import { renderSky } from './terrain-renderer';
import type { TerrainTheme } from './themes';

/** A background that can actually be drawn ("Random" resolves to one of these per game). */
export type ActiveBackground = Exclude<Background, 'random'>;
export const RANDOM_POOL: readonly ActiveBackground[] = [
  'stars',
  'bars',
  'circles',
  'spreading',
  'blue',
];

export function resolveBackground(bg: Background, rng: Rng): ActiveBackground {
  return bg === 'random' ? rng.pick(RANDOM_POOL) : bg;
}

/**
 * Animation phase advance per tick at speed 1 (0 = still, 10 = fastest). At speed 10 a
 * palette-cycled background loops in about two seconds.
 */
const PHASE_PER_SPEED = 0.06;
const PALETTE_SIZE = 64;

function packRgb(r: number, g: number, b: number): number {
  return ((0xff << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;
}

/** HSV (h in degrees, s and v in 0–1) to a packed little-endian RGBA pixel. */
export function hsvPixel(h: number, s: number, v: number): number {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return 255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return packRgb(f(5), f(3), f(1));
}

/**
 * Palettes for the palette-cycled backgrounds, emulating VGA color cycling. Kept dark (value
 * at most ~0.45) so shells, tanks and explosions stay easy to see.
 */
function palette(kind: 'bars' | 'circles' | 'spreading'): Uint32Array {
  const p = new Uint32Array(PALETTE_SIZE);
  const hues = [0, 28, 52, 120, 178, 215, 265, 310];
  for (let i = 0; i < PALETTE_SIZE; i++) {
    if (kind === 'bars') {
      // Eight hue bands, each a dark → bright → dark ramp of eight shades.
      const band = Math.floor(i / 8);
      const j = i % 8;
      p[i] = hsvPixel(hues[band]!, 0.85, 0.1 + 0.35 * Math.sin((Math.PI * (j + 0.5)) / 8));
    } else if (kind === 'circles') {
      // Two trips around the color wheel, with alternate rings darker for definition.
      p[i] = hsvPixel(((i / PALETTE_SIZE) * 720) % 360, 0.9, i % 4 < 2 ? 0.42 : 0.24);
    } else {
      p[i] = hsvPixel(
        (i / PALETTE_SIZE) * 360,
        0.85,
        0.2 + 0.18 * Math.sin((i / 64) * Math.PI * 6),
      );
    }
  }
  return p;
}

interface Star {
  x: number;
  y: number;
  /** Brightness 0–1 before twinkling. */
  base: number;
  /** Twinkle rate and phase. */
  rate: number;
  phase: number;
  tint: number;
  big: boolean;
}

interface Cloud {
  sprite: HTMLCanvasElement;
  x: number;
  y: number;
  /** Drift multiplier: far clouds are slower. */
  depth: number;
}

const STAR_TINTS = [
  [255, 255, 255],
  [190, 210, 255],
  [255, 236, 190],
];
const STAR_LEVELS = 8;

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  return [c, ctx];
}

/**
 * The animated sky behind the battlefield. Presentation only: it has its own RNG and never
 * touches the sim. Call `tick(speed)` once per frame tick and `draw(ctx)` at the field origin.
 *
 * Bars, Circles and Spreading are palette-cycled: a precomputed index buffer (at half
 * resolution, drawn 2× for chunky pixels and cheap updates) is mapped through a rotating
 * color lookup table, so each frame costs one pass over 50k bytes. Stars twinkle and Blue is
 * the landscape's sky with drifting clouds.
 */
export class BackgroundLayer {
  private phase = 0;
  private drawnOffset = -1;
  private readonly rng: Rng;
  /** Palette-cycled kinds. */
  private cycled: {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    image: ImageData;
    pixels: Uint32Array;
    index: Uint8Array;
    palette: Uint32Array;
    lut: Uint32Array;
    /** +1: colors move toward higher indices. */
    dir: 1 | -1;
  } | null = null;
  private base: HTMLCanvasElement | null = null;
  private stars: Star[] = [];
  private starStyles: string[][] = [];
  private shooting: { x: number; y: number; vx: number; vy: number; age: number } | null = null;
  private nextShooting = 0;
  private clouds: Cloud[] = [];

  constructor(
    readonly kind: ActiveBackground,
    private readonly width: number,
    private readonly height: number,
    theme: TerrainTheme,
    seed: number,
  ) {
    this.rng = new Rng(seed);
    if (kind === 'bars' || kind === 'circles' || kind === 'spreading') this.initCycled(kind);
    else if (kind === 'stars') this.initStars(theme);
    else if (kind === 'blue') this.initBlue(theme);
  }

  private initCycled(kind: 'bars' | 'circles' | 'spreading'): void {
    const w = Math.ceil(this.width / 2);
    const h = Math.ceil(this.height / 2);
    const [canvas, ctx] = makeCanvas(w, h);
    const image = ctx.createImageData(w, h);
    const index = new Uint8Array(w * h);
    const cx = w / 2;
    const cy = h / 2;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v: number;
        if (kind === 'bars') v = Math.floor(y / 2);
        else {
          const d = Math.hypot(x - cx, y - cy);
          if (kind === 'circles') v = Math.floor(d / 2.5);
          else {
            // Three-armed spiral: angle plus distance.
            const a = Math.atan2(y - cy, x - cx) / (2 * Math.PI) + 0.5;
            v = Math.floor(a * PALETTE_SIZE * 3 + d / 3);
          }
        }
        index[y * w + x] = v & (PALETTE_SIZE - 1);
      }
    }
    this.cycled = {
      canvas,
      ctx,
      image,
      pixels: new Uint32Array(image.data.buffer),
      index,
      palette: palette(kind),
      lut: new Uint32Array(PALETTE_SIZE),
      // Bars rise, circles spread outward, the spiral turns.
      dir: kind === 'bars' ? 1 : -1,
    };
  }

  private initStars(theme: TerrainTheme): void {
    this.base = renderSky(this.width, this.height, {
      ...theme,
      sky: ['#000000', '#020208', '#05050f', darkenHex(theme.sky[0]!, 0.6)],
    });
    const n = Math.round((this.width * this.height) / 900);
    for (let i = 0; i < n; i++) {
      const base = 0.25 + this.rng.float() * 0.75;
      this.stars.push({
        x: this.rng.int(0, this.width - 1),
        // Denser toward the top, where terrain rarely covers them.
        y: Math.floor(this.rng.float() ** 1.4 * this.height),
        base,
        rate: 0.02 + this.rng.float() * 0.08,
        phase: this.rng.float() * Math.PI * 2,
        tint: this.rng.int(0, STAR_TINTS.length - 1),
        big: base > 0.93,
      });
    }
    this.starStyles = STAR_TINTS.map(([r, g, b]) =>
      Array.from({ length: STAR_LEVELS }, (_, l) => {
        const k = (l + 1) / STAR_LEVELS;
        return `rgb(${Math.round(r! * k)} ${Math.round(g! * k)} ${Math.round(b! * k)})`;
      }),
    );
    this.nextShooting = 200 + this.rng.int(0, 600);
  }

  private initBlue(theme: TerrainTheme): void {
    this.base = renderSky(this.width, this.height, theme);
    for (let i = 0; i < 6; i++) {
      const depth = 0.4 + (i / 5) * 0.6;
      this.clouds.push({
        sprite: makeCloud(this.rng, depth),
        x: this.rng.int(-60, this.width),
        y: Math.round(8 + this.rng.float() * this.height * 0.35),
        depth,
      });
    }
    this.clouds.sort((a, b) => a.depth - b.depth);
  }

  /** Advances the animation; speed 0–10 (0 = still). */
  tick(speed: number): void {
    if (speed <= 0) return;
    const dp = speed * PHASE_PER_SPEED;
    this.phase += dp;
    if (this.kind === 'blue') {
      for (const c of this.clouds) {
        c.x += dp * 0.5 * c.depth;
        if (c.x > this.width) c.x = -c.sprite.width;
      }
    }
    if (this.kind === 'stars') {
      const s = this.shooting;
      if (s) {
        s.x += s.vx;
        s.y += s.vy;
        s.age++;
        if (s.age > 40) this.shooting = null;
      } else if ((this.nextShooting -= speed / 5) <= 0) {
        const left = this.rng.float() < 0.5;
        this.shooting = {
          x: this.rng.int(40, this.width - 40),
          y: this.rng.int(4, Math.floor(this.height * 0.3)),
          vx: (left ? -1 : 1) * (3 + this.rng.float() * 2),
          vy: 1 + this.rng.float(),
          age: 0,
        };
        this.nextShooting = 300 + this.rng.int(0, 900);
      }
    }
  }

  /** Draws at the field origin (the caller has translated the context). */
  draw(ctx: CanvasRenderingContext2D): void {
    const c = this.cycled;
    if (c) {
      const offset = Math.floor(this.phase) & (PALETTE_SIZE - 1);
      if (offset !== this.drawnOffset) {
        this.drawnOffset = offset;
        const shift = c.dir === 1 ? PALETTE_SIZE - offset : offset;
        for (let i = 0; i < PALETTE_SIZE; i++) {
          c.lut[i] = c.palette[(i + shift) & (PALETTE_SIZE - 1)]!;
        }
        const { pixels, index, lut } = c;
        for (let i = 0; i < pixels.length; i++) pixels[i] = lut[index[i]!]!;
        c.ctx.putImageData(c.image, 0, 0);
      }
      ctx.drawImage(c.canvas, 0, 0, c.canvas.width * 2, c.canvas.height * 2);
      return;
    }
    if (this.base) ctx.drawImage(this.base, 0, 0);
    else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, this.width, this.height);
    }
    if (this.kind === 'stars') this.drawStars(ctx);
    if (this.kind === 'blue') {
      ctx.globalAlpha = 0.75;
      for (const cl of this.clouds) ctx.drawImage(cl.sprite, Math.round(cl.x), cl.y);
      ctx.globalAlpha = 1;
    }
  }

  private drawStars(ctx: CanvasRenderingContext2D): void {
    for (const s of this.stars) {
      const tw = 0.55 + 0.45 * Math.sin(this.phase * s.rate * 12 + s.phase);
      const level = Math.max(0, Math.min(STAR_LEVELS - 1, Math.floor(s.base * tw * STAR_LEVELS)));
      ctx.fillStyle = this.starStyles[s.tint]![level]!;
      if (s.big && level >= STAR_LEVELS - 3) {
        ctx.fillRect(s.x - 1, s.y, 3, 1);
        ctx.fillRect(s.x, s.y - 1, 1, 3);
      } else ctx.fillRect(s.x, s.y, 1, 1);
    }
    const sh = this.shooting;
    if (sh) {
      const fade = 1 - sh.age / 40;
      for (let i = 0; i < 8; i++) {
        ctx.fillStyle = `rgb(255 255 255 / ${fade * (1 - i / 8)})`;
        ctx.fillRect(Math.round(sh.x - sh.vx * i * 0.7), Math.round(sh.y - sh.vy * i * 0.7), 1, 1);
      }
    }
  }
}

/** A puffy pixel cloud: a cluster of circles, white on top with a shaded underside. */
function makeCloud(rng: Rng, depth: number): HTMLCanvasElement {
  const w = Math.round(40 + rng.float() * 50 * depth);
  const h = Math.round(w * 0.45);
  const [c, ctx] = makeCanvas(w, h);
  const blobs: { x: number; y: number; r: number }[] = [];
  const n = 4 + rng.int(0, 3);
  for (let i = 0; i < n; i++) {
    const r = h * (0.25 + rng.float() * 0.2);
    blobs.push({ x: r + rng.float() * (w - 2 * r), y: h - r - rng.float() * (h * 0.3), r });
  }
  const inside = (x: number, y: number) =>
    blobs.some((b) => (x - b.x) ** 2 + (y - b.y) ** 2 <= b.r * b.r);
  const light = Math.round(225 + depth * 30);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      // Shade pixels near the bottom edge of the shape.
      const shaded = !inside(x, y + 3);
      ctx.fillStyle = shaded
        ? `rgb(${light - 50} ${light - 40} ${light - 20})`
        : `rgb(${light} ${light} ${light})`;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  return c;
}

function darkenHex(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.round(((v >> s) & 0xff) * (1 - k));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
