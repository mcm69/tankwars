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
