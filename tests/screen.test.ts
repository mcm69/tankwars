import { describe, expect, it } from 'vitest';
import { computeScale } from '../src/render/screen';

describe('computeScale', () => {
  it('uses the largest integer scale that fits', () => {
    expect(computeScale(1920, 1080, 1, 640, 400)).toBe(2);
    expect(computeScale(1300, 900, 1, 640, 400)).toBe(2);
  });

  it('works in device pixels on HiDPI screens', () => {
    // 1440x900 CSS at 2x DPR = 2880x1800 device px → 4x device = 2x CSS.
    expect(computeScale(1440, 900, 2, 640, 400)).toBe(2);
    // 1000x700 CSS at 2x: fit is 1.5625 CSS = 3.125 device → 3 device px = 1.5 CSS.
    expect(computeScale(1000, 700, 2, 640, 400)).toBe(1.5);
  });

  it('falls back to a fractional fit on small viewports', () => {
    expect(computeScale(320, 800, 1, 640, 400)).toBe(0.5);
  });
});

describe('touch layout', () => {
  it('widens the canvas to the device aspect, within limits', async () => {
    const { touchCanvasWidth, TOUCH_MIN_WIDTH, TOUCH_MAX_WIDTH } =
      await import('../src/render/screen');
    expect(touchCanvasWidth(750, 342)).toBe(876); // iPhone 13 landscape
    expect(touchCanvasWidth(568, 320)).toBe(TOUCH_MIN_WIDTH); // narrow phones letterbox
    expect(touchCanvasWidth(1080, 810)).toBe(TOUCH_MIN_WIDTH); // 4:3 tablets
    expect(touchCanvasWidth(2000, 400)).toBe(TOUCH_MAX_WIDTH);
    expect(touchCanvasWidth(751, 342) % 2).toBe(0);
  });

  it('fills the viewport (no integer snapping) when asked', () => {
    expect(computeScale(750, 342, 3, 876, 400, false)).toBeCloseTo(342 / 400);
    expect(computeScale(750, 342, 3, 876, 400, true)).toBeCloseTo(2 / 3);
  });

  it('places big, non-overlapping buttons inside the side panels', async () => {
    const { touchLayout } = await import('../src/input/touch-controls');
    for (const sw of [80, 118, 160]) {
      const rects = Object.entries(touchLayout(sw, 640));
      for (const [id, r] of rects) {
        const inLeft = r.x >= 0 && r.x + r.w <= sw;
        const inRight = r.x >= sw + 640 && r.x + r.w <= 2 * sw + 640;
        expect(inLeft || inRight, id).toBe(true);
        expect(r.h, id).toBeGreaterThanOrEqual(40);
        expect(r.w, id).toBeGreaterThanOrEqual(26);
        expect(r.y + r.h, id).toBeLessThanOrEqual(400);
      }
      for (let a = 0; a < rects.length; a++) {
        for (let b = a + 1; b < rects.length; b++) {
          const [, p] = rects[a]!;
          const [, q] = rects[b]!;
          const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
          expect(overlap, `${rects[a]![0]} vs ${rects[b]![0]}`).toBe(false);
        }
      }
    }
  });
});
