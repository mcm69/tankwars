/**
 * Original 5×7 bitmap font (LCD-style) for crisp text on the pixel canvas. Each glyph is 7 rows
 * encoded as 2 hex digits; bit 4 is the leftmost column. Unknown characters render as '?'.
 */
const GLYPHS: Record<string, string> = Object.fromEntries([
  [' ', '00000000000000'],
  ['!', '04040404000004'],
  ['"', '0a0a0a00000000'],
  ['#', '0a0a1f0a1f0a0a'],
  ['$', '040f140e051e04'],
  ['%', '18190204081303'],
  ['&', '0c12140815120d'],
  ["'", '0c040800000000'],
  ['(', '02040808080402'],
  [')', '08040202020408'],
  ['*', '0004150e150400'],
  ['+', '0004041f040400'],
  [',', '000000000c0408'],
  ['-', '0000001f000000'],
  ['.', '00000000000c0c'],
  ['/', '00010204081000'],
  ['0', '0e11131519110e'],
  ['1', '040c040404040e'],
  ['2', '0e11010204081f'],
  ['3', '1f02040201110e'],
  ['4', '02060a121f0202'],
  ['5', '1f101e0101110e'],
  ['6', '0608101e11110e'],
  ['7', '1f010204080808'],
  ['8', '0e11110e11110e'],
  ['9', '0e11110f01020c'],
  [':', '000c0c000c0c00'],
  [';', '000c0c000c0408'],
  ['<', '02040810080402'],
  ['=', '00001f001f0000'],
  ['>', '08040201020408'],
  ['?', '0e110102040004'],
  ['@', '0e11010d15150e'],
  ['A', '0e1111111f1111'],
  ['B', '1e11111e11111e'],
  ['C', '0e11101010110e'],
  ['D', '1c12111111121c'],
  ['E', '1f10101e10101f'],
  ['F', '1f10101e101010'],
  ['G', '0e11101711110f'],
  ['H', '1111111f111111'],
  ['I', '0e04040404040e'],
  ['J', '0702020202120c'],
  ['K', '11121418141211'],
  ['L', '1010101010101f'],
  ['M', '111b1515111111'],
  ['N', '11111915131111'],
  ['O', '0e11111111110e'],
  ['P', '1e11111e101010'],
  ['Q', '0e11111115120d'],
  ['R', '1e11111e141211'],
  ['S', '0f10100e01011e'],
  ['T', '1f040404040404'],
  ['U', '1111111111110e'],
  ['V', '11111111110a04'],
  ['W', '1111111515150a'],
  ['X', '11110a040a1111'],
  ['Y', '1111110a040404'],
  ['Z', '1f01020408101f'],
  ['[', '0e08080808080e'],
  ['\\', '00100804020100'],
  [']', '0e02020202020e'],
  ['^', '040a1100000000'],
  ['_', '0000000000001f'],
  ['`', '08040200000000'],
  ['a', '00000e010f110f'],
  ['b', '1010161911111e'],
  ['c', '00000e1010110e'],
  ['d', '01010d1311110f'],
  ['e', '00000e111f100e'],
  ['f', '0609081c080808'],
  ['g', '00000f110f010e'],
  ['h', '10101619111111'],
  ['i', '04000c0404040e'],
  ['j', '0200060202120c'],
  ['k', '10101214181412'],
  ['l', '0c04040404040e'],
  ['m', '00001a15151111'],
  ['n', '00001619111111'],
  ['o', '00000e1111110e'],
  ['p', '00001e111e1010'],
  ['q', '00000d130f0101'],
  ['r', '00001619101010'],
  ['s', '00000e100e011e'],
  ['t', '08081c08080906'],
  ['u', '0000111111130d'],
  ['v', '00001111110a04'],
  ['w', '0000111115150a'],
  ['x', '0000110a040a11'],
  ['y', '000011110f010e'],
  ['z', '00001f0204081f'],
  ['{', '02040408040402'],
  ['|', '04040404040404'],
  ['}', '08040402040408'],
  ['~', '00000815020000'],
  ['→', '0004021f020400'],
  ['←', '0004081f080400'],
  ['↑', '040e1504040400'],
  ['↓', '00040404150e04'],
  ['◀', '02060e1e0e0602'],
  ['▶', '080c0e0f0e0c08'],
  ['…', '00000000000015'],
  ['×', '00110a040a1100'],
  ['±', '04041f0404001f'],
  ['•', '00000e0e0e0000'],
]);

export const GLYPH_W = 5;
export const GLYPH_H = 7;
/** Horizontal advance per character at scale 1 (glyph + 1 px spacing). */
export const ADVANCE = 6;

const ORDER = Object.keys(GLYPHS);
const INDEX = new Map(ORDER.map((c, i) => [c, i]));

function rows(c: string): number[] {
  const hex = GLYPHS[c] ?? GLYPHS['?']!;
  const out: number[] = [];
  for (let r = 0; r < GLYPH_H; r++) out.push(parseInt(hex.slice(r * 2, r * 2 + 2), 16));
  return out;
}

/** Per-color glyph atlases: one row of glyphs, built on first use. */
const atlases = new Map<string, HTMLCanvasElement>();

function atlas(color: string): HTMLCanvasElement {
  const hit = atlases.get(color);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = ORDER.length * GLYPH_W;
  canvas.height = GLYPH_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.fillStyle = color;
  ORDER.forEach((c, gi) => {
    rows(c).forEach((bits, y) => {
      for (let x = 0; x < GLYPH_W; x++) {
        if (bits & (1 << (GLYPH_W - 1 - x))) ctx.fillRect(gi * GLYPH_W + x, y, 1, 1);
      }
    });
  });
  atlases.set(color, canvas);
  return canvas;
}

export function textWidth(text: string, scale = 1): number {
  return text.length === 0 ? 0 : [...text].length * ADVANCE * scale - scale;
}

export type Align = 'left' | 'center' | 'right';

/** Draws text with its top-left at (x, y) (or aligned around x). Returns the drawn width. */
export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
  align: Align = 'left',
): number {
  const w = textWidth(text, scale);
  let cx = Math.round(align === 'center' ? x - w / 2 : align === 'right' ? x - w : x);
  const cy = Math.round(y);
  const img = atlas(color);
  for (const ch of text) {
    const gi = INDEX.get(ch) ?? INDEX.get('?')!;
    if (ch !== ' ') {
      ctx.drawImage(
        img,
        gi * GLYPH_W,
        0,
        GLYPH_W,
        GLYPH_H,
        cx,
        cy,
        GLYPH_W * scale,
        GLYPH_H * scale,
      );
    }
    cx += ADVANCE * scale;
  }
  return w;
}

/** Text with a 1-px (× scale) drop shadow, for legibility over busy backgrounds. */
export function drawTextShadow(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale = 1,
  align: Align = 'left',
  shadow = '#000',
): number {
  drawText(ctx, text, x + scale, y + scale, shadow, scale, align);
  return drawText(ctx, text, x, y, color, scale, align);
}

/** Exposed for tests: glyph rows for a character. */
export function glyphRows(c: string): number[] {
  return rows(c);
}

export const FONT_CHARS = ORDER;

// 3×5 micro digits for counts on the equipment strip. Each row is 3 bits.
const MICRO: Record<string, readonly number[]> = {
  '0': [7, 5, 5, 5, 7],
  '1': [2, 6, 2, 2, 7],
  '2': [7, 1, 7, 4, 7],
  '3': [7, 1, 3, 1, 7],
  '4': [5, 5, 7, 1, 1],
  '5': [7, 4, 7, 1, 7],
  '6': [7, 4, 7, 5, 7],
  '7': [7, 1, 1, 2, 2],
  '8': [7, 5, 7, 5, 7],
  '9': [7, 5, 7, 1, 7],
  k: [4, 5, 6, 5, 5],
};

/** Draws a short number in the 3×5 micro font, right-aligned at x. */
export function drawMicro(
  ctx: CanvasRenderingContext2D,
  text: string,
  rightX: number,
  y: number,
  color: string,
): void {
  ctx.fillStyle = color;
  let x = rightX - text.length * 4 + 1;
  for (const ch of text) {
    const rowsBits = MICRO[ch];
    if (rowsBits) {
      rowsBits.forEach((bits, r) => {
        for (let c = 0; c < 3; c++) if (bits & (4 >> c)) ctx.fillRect(x + c, y + r, 1, 1);
      });
    }
    x += 4;
  }
}

/** Compact count label: 0–999 as is, then e.g. "1k". */
export function compactCount(n: number): string {
  return n < 1000 ? String(n) : `${Math.floor(n / 1000)}k`;
}
