/** Color themes for the battlefield. Colors are CSS hex strings; converted once at load. */
export interface TerrainTheme {
  name: string;
  /** Sky gradient, top to bottom, drawn in hard bands for a retro look. */
  sky: readonly string[];
  /** Dirt shades from the surface layer down to bedrock. */
  dirt: readonly string[];
  /** Highlight for the top 1–2 pixels of exposed ground. */
  edge: readonly [string, string];
}

export const THEMES: readonly TerrainTheme[] = [
  {
    name: 'meadow',
    sky: ['#0b1a3a', '#173a6b', '#2d6aa3', '#5aa0cf', '#9fd2ea'],
    dirt: ['#4f9a2e', '#3f8526', '#326e22', '#2a5a1f', '#23491b', '#1c3a17'],
    edge: ['#a6e05a', '#74c23e'],
  },
  {
    name: 'desert',
    sky: ['#2b1240', '#5c2357', '#a3405a', '#e07a4f', '#f5c16c'],
    dirt: ['#d9a35b', '#c98f4a', '#b17a3d', '#946332', '#7a4f29', '#5e3c20'],
    edge: ['#fbe3a1', '#ebc27a'],
  },
  {
    name: 'mars',
    sky: ['#05030a', '#1a0d1f', '#3b1726', '#6b2a2a', '#a04a32'],
    dirt: ['#b8542f', '#a24628', '#883a23', '#6e2f1e', '#562419', '#3f1a13'],
    edge: ['#f09a63', '#d4703f'],
  },
  {
    name: 'tundra',
    sky: ['#101830', '#24345a', '#46628a', '#7c9cbc', '#c4d8e8'],
    dirt: ['#8a9aa8', '#76879a', '#64748a', '#535f75', '#434d60', '#343c4c'],
    edge: ['#ffffff', '#dde8f0'],
  },
  {
    name: 'neon',
    sky: ['#05000f', '#12002b', '#2a0050', '#47007a', '#6a00a3'],
    dirt: ['#1fb86b', '#18a05c', '#13874d', '#0f6e3f', '#0b5632', '#083f25'],
    edge: ['#7dffb8', '#39e88e'],
  },
];

/** Packs a #rrggbb string into a little-endian RGBA uint32 for ImageData writes. */
export function packColor(hex: string): number {
  const v = parseInt(hex.slice(1), 16);
  const r = (v >> 16) & 0xff;
  const g = (v >> 8) & 0xff;
  const b = v & 0xff;
  return ((0xff << 24) | (b << 16) | (g << 8) | r) >>> 0;
}
