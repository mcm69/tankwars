import { ITEMS } from '../sim/items';

/**
 * 10×10 procedural pixel icons for every item. '#' = primary color, '+' = secondary,
 * anything else = transparent.
 */
interface IconDef {
  art: readonly string[];
  primary: string;
  secondary?: string;
}

const FIRE = '#ff8a2a';
const FIRE_HI = '#ffe36a';
const NUKE = '#ffe23a';
const DIRT = '#a0663a';
const DIRT_HI = '#d39a5e';
const CRI = '#5cf07a';

const ball = (r: number): string[] => {
  const out: string[] = [];
  for (let y = 0; y < 10; y++) {
    let row = '';
    for (let x = 0; x < 10; x++) {
      const dx = x - 4.5;
      const dy = y - 4.5;
      const d = Math.hypot(dx, dy);
      row += d <= r ? (dx + dy < -r * 0.6 ? '+' : '#') : '.';
    }
    out.push(row);
  }
  return out;
};

const ICONS: Record<string, IconDef> = {
  leadBall: { art: ball(1.6), primary: '#b8b8c8', secondary: '#ffffff' },
  incinerator: { art: ball(2.6), primary: FIRE, secondary: FIRE_HI },
  incineratorMk2: { art: ball(4.4), primary: FIRE, secondary: FIRE_HI },
  nuke20kt: {
    art: [
      '..........',
      '..........',
      '...#..#...',
      '..##..##..',
      '..###+##..',
      '.....+....',
      '....###...',
      '....###...',
      '..........',
      '..........',
    ],
    primary: NUKE,
    secondary: '#000000',
  },
  nuke5mt: {
    art: [
      '.##....##.',
      '###....###',
      '####..####',
      '####..####',
      '.....+....',
      '....++....',
      '...####...',
      '..######..',
      '..######..',
      '...####...',
    ],
    primary: NUKE,
    secondary: '#000000',
  },
  laser: {
    art: [
      '.........+',
      '........+.',
      '.......#..',
      '......#...',
      '.....#....',
      '....#.....',
      '...#......',
      '..#.......',
      '.##.......',
      '##........',
    ],
    primary: '#ff3a3a',
    secondary: '#ffffff',
  },
  cri4d: {
    art: [
      '..........',
      '..........',
      '..........',
      '...#.#....',
      '....#.#...',
      '...#.#....',
      '..........',
      '..........',
      '..........',
      '..........',
    ],
    primary: CRI,
  },
  cri8nd: {
    art: [
      '..........',
      '..#.....#.',
      '..........',
      '.....#....',
      '.#........',
      '.......#..',
      '...#......',
      '........#.',
      '..#..#....',
      '..........',
    ],
    primary: CRI,
  },
  cri8d: {
    art: [
      '..........',
      '..........',
      '..#.#.#...',
      '...#.#.#..',
      '..#.#.#...',
      '...#.#.#..',
      '..#.#.#...',
      '..........',
      '..........',
      '..........',
    ],
    primary: CRI,
  },
  cri20nd: {
    art: [
      '#...#...#.',
      '..#...#...',
      '#...#...#.',
      '..#...#..#',
      '#...#...#.',
      '..#...#...',
      '#...#...#.',
      '..#...#..#',
      '#...#...#.',
      '..#...#...',
    ],
    primary: CRI,
  },
  cri20d: {
    art: [
      '#.#.#.#.#.',
      '.#.#.#.#.#',
      '#.#.#.#.#.',
      '.#.#.#.#.#',
      '#.#.#.#.#.',
      '.#.#.#.#.#',
      '#.#.#.#.#.',
      '.#.#.#.#.#',
      '#.#.#.#.#.',
      '.#.#.#.#.#',
    ],
    primary: CRI,
  },
  grenade: {
    art: [
      '.....++...',
      '....+..+..',
      '....##....',
      '...####...',
      '..#+##+#..',
      '..######..',
      '..#+##+#..',
      '..######..',
      '...####...',
      '..........',
    ],
    primary: '#4f8a3a',
    secondary: '#c8c8c8',
  },
  sonic: {
    art: [
      '.....#....',
      '...#..#...',
      '.#..#..#..',
      '..#..#..#.',
      '+..#..#..#',
      '+..#..#..#',
      '..#..#..#.',
      '.#..#..#..',
      '...#..#...',
      '.....#....',
    ],
    primary: '#6ab4ff',
    secondary: '#ffffff',
  },
  dirtBall: { art: ball(2.2), primary: DIRT, secondary: DIRT_HI },
  dirtBallMk2: { art: ball(3.2), primary: DIRT, secondary: DIRT_HI },
  dirtCompressed: { art: ball(4.0), primary: '#8a5530', secondary: DIRT_HI },
  dirtSuper: { art: ball(5.0), primary: '#6e4224', secondary: DIRT_HI },
  dirtExplosive: {
    art: [
      '#...#...#.',
      '.#..#..#..',
      '..#.#.#...',
      '...+++....',
      '####+####.',
      '...+++....',
      '..#.#.#...',
      '.#..#..#..',
      '#...#...#.',
      '..........',
    ],
    primary: DIRT,
    secondary: FIRE_HI,
  },
  guidanceH: {
    art: [
      '..........',
      '.##....##.',
      '.##....##.',
      '.##....##.',
      '.########.',
      '.########.',
      '.##....##.',
      '.##....##.',
      '.##....##.',
      '..........',
    ],
    primary: '#ffffff',
  },
  guidanceV: {
    art: [
      '..........',
      '.##....##.',
      '.##....##.',
      '.##....##.',
      '.##....##.',
      '..##..##..',
      '..##..##..',
      '...####...',
      '....##....',
      '..........',
    ],
    primary: '#ffffff',
  },
  shieldEnergy: {
    art: [
      '...####...',
      '..#....#..',
      '.#..++..#.',
      '#..+..+..#',
      '#.+....+.#',
      '#.+....+.#',
      '#..+..+..#',
      '.#..++..#.',
      '..#....#..',
      '...####...',
    ],
    primary: '#3fe6e6',
    secondary: '#a8ffff',
  },
  shieldInertia: {
    art: [
      '....##....',
      '....##....',
      '..######..',
      '...####...',
      '....##....',
      '..........',
      '.########.',
      '.#.#.#.#..',
      '..#.#.#.#.',
      '.########.',
    ],
    primary: '#c0c0d0',
  },
};

export const ICON_SIZE = 10;

const cache = new Map<string, HTMLCanvasElement>();

/** Cached icon canvas for an item; `dim` renders a desaturated "not owned" variant. */
export function itemIcon(index: number, dim = false): HTMLCanvasElement {
  const id = ITEMS[index]!.id;
  const key = `${id}:${dim}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = ICONS[id];
  if (!def) throw new Error(`No icon for ${id}`);
  const canvas = document.createElement('canvas');
  canvas.width = ICON_SIZE;
  canvas.height = ICON_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  def.art.forEach((row, y) => {
    for (let x = 0; x < ICON_SIZE; x++) {
      const ch = row[x];
      const color = ch === '#' ? def.primary : ch === '+' ? (def.secondary ?? def.primary) : null;
      if (!color) continue;
      ctx.fillStyle = dim ? '#3a3448' : color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  cache.set(key, canvas);
  return canvas;
}

/** Exposed for tests: every item must have a well-formed icon. */
export function iconArt(id: string): readonly string[] | undefined {
  return ICONS[id]?.art;
}
