import type { Rng } from '../core/rng';
import { Terrain } from './terrain';

export const TERRAIN_STYLES = ['rolling', 'jagged', 'plateaus', 'valley', 'mountain'] as const;
export type TerrainStyle = (typeof TERRAIN_STYLES)[number];

export interface TerrainGenOptions {
  /** Defaults to a random style. */
  style?: TerrainStyle;
  /** Highest allowed surface, as a fraction of field height from the top. */
  minSurface?: number;
  /** Lowest allowed surface, as a fraction of field height from the top. */
  maxSurface?: number;
}

interface StyleParams {
  roughness: number;
  amplitude: number;
  smoothPasses: number;
  terraceStep?: number;
  bowl?: number;
}

const STYLE_PARAMS: Record<TerrainStyle, StyleParams> = {
  rolling: { roughness: 0.48, amplitude: 0.7, smoothPasses: 3 },
  jagged: { roughness: 0.62, amplitude: 0.8, smoothPasses: 0 },
  plateaus: { roughness: 0.52, amplitude: 0.8, smoothPasses: 1, terraceStep: 0.12 },
  valley: { roughness: 0.5, amplitude: 0.45, smoothPasses: 2, bowl: 0.45 },
  mountain: { roughness: 0.5, amplitude: 0.45, smoothPasses: 2, bowl: -0.45 },
};

/**
 * Midpoint displacement over 2^k+1 points in [0,1] (0 = high ground, 1 = low ground),
 * with `roughness` scaling the displacement at each halving.
 */
function midpointDisplacement(rng: Rng, n: number, amplitude: number, roughness: number) {
  let size = 1;
  while (size + 1 < n) size *= 2;
  const pts = new Float64Array(size + 1);
  pts[0] = rng.range(0.2, 0.8);
  pts[size] = rng.range(0.2, 0.8);
  let amp = amplitude;
  for (let step = size; step > 1; step /= 2) {
    const half = step / 2;
    for (let i = half; i < size; i += step) {
      pts[i] = (pts[i - half]! + pts[i + half]!) / 2 + rng.range(-amp, amp) / 2;
    }
    amp *= roughness;
  }
  return pts;
}

function resample(src: Float64Array, n: number): Float64Array {
  const out = new Float64Array(n);
  const scale = (src.length - 1) / Math.max(1, n - 1);
  for (let x = 0; x < n; x++) {
    const t = x * scale;
    const i = Math.floor(t);
    const f = t - i;
    out[x] = src[i]! * (1 - f) + (src[Math.min(i + 1, src.length - 1)] ?? 0) * f;
  }
  return out;
}

function smooth(h: Float64Array, passes: number): void {
  for (let p = 0; p < passes; p++) {
    let prev = h[0]!;
    for (let x = 1; x < h.length - 1; x++) {
      const cur = h[x]!;
      h[x] = (prev + cur * 2 + h[x + 1]!) / 4;
      prev = cur;
    }
  }
}

/** Median filter (window 5): removes 1–2 px needles without rounding off cliffs. */
function despike(h: Float64Array): void {
  const src = Float64Array.from(h);
  const win: number[] = [];
  for (let x = 2; x < h.length - 2; x++) {
    win.length = 0;
    for (let k = -2; k <= 2; k++) win.push(src[x + k]!);
    win.sort((a, b) => a - b);
    h[x] = win[2]!;
  }
}

/** Normalizes values into [0,1] so every style uses the full allowed band. */
function normalize(h: Float64Array): void {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of h) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const span = hi - lo || 1;
  for (let x = 0; x < h.length; x++) h[x] = (h[x]! - lo) / span;
}

/**
 * Generates surface rows (row index of the top solid pixel per column) for a field.
 * Exposed separately from `generateTerrain` for tests and previews.
 */
export function generateSurface(
  rng: Rng,
  width: number,
  height: number,
  options: TerrainGenOptions = {},
): { surface: Float64Array; style: TerrainStyle } {
  const style = options.style ?? rng.pick(TERRAIN_STYLES);
  const p = STYLE_PARAMS[style];
  const minS = options.minSurface ?? 0.18;
  const maxS = options.maxSurface ?? 0.9;

  const h = resample(midpointDisplacement(rng, width, p.amplitude, p.roughness), width);
  normalize(h);

  if (p.bowl) {
    // Valley (positive) pushes the middle down; mountain (negative) pushes it up.
    for (let x = 0; x < width; x++) {
      const t = (x / (width - 1)) * 2 - 1;
      h[x] = h[x]! * (1 - Math.abs(p.bowl)) + Math.abs(p.bowl) * (p.bowl > 0 ? 1 - t * t : t * t);
    }
    normalize(h);
  }

  if (p.terraceStep) {
    // Flat shelves joined by short steep ramps: the original's plateau-and-cliff look.
    // Step height and cliff steepness vary per seed so it doesn't read as a staircase.
    const step = p.terraceStep * rng.range(0.7, 1.5);
    const shelf = rng.range(0.6, 0.88);
    const offset = rng.float();
    for (let x = 0; x < width; x++) {
      const v = h[x]! / step + offset;
      const base = Math.floor(v);
      const f = v - base;
      const ramp = f < shelf ? 0 : (f - shelf) / (1 - shelf);
      h[x] = (base + ramp - offset) * step;
    }
    // Low-amplitude detail so shelves are uneven rather than ruler-flat.
    const detail = resample(midpointDisplacement(rng, width, 0.5, 0.6), width);
    for (let x = 0; x < width; x++) h[x] = h[x]! + (detail[x]! - 0.5) * step * 0.35;
  }

  if (style !== 'jagged') despike(h);
  smooth(h, p.smoothPasses);
  normalize(h);

  const surface = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    surface[x] = Math.round(height * (minS + (maxS - minS) * h[x]!));
  }
  return { surface, style };
}

export function generateTerrain(
  rng: Rng,
  width: number,
  height: number,
  options: TerrainGenOptions = {},
): { terrain: Terrain; style: TerrainStyle } {
  const { surface, style } = generateSurface(rng, width, height, options);
  const terrain = new Terrain(width, height);
  terrain.fillFromSurface(surface);
  return { terrain, style };
}
