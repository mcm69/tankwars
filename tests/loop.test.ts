import { describe, expect, it } from 'vitest';
import { FixedStepper } from '../src/core/loop';

describe('FixedStepper', () => {
  it('runs whole ticks and carries the remainder', () => {
    const s = new FixedStepper(50); // 20 ms per tick
    expect(s.advance(45)).toEqual({ ticks: 2, alpha: 0.25 });
    expect(s.advance(15)).toEqual({ ticks: 1, alpha: 0 });
  });

  it('accumulates small frames', () => {
    const s = new FixedStepper(50);
    expect(s.advance(10).ticks).toBe(0);
    expect(s.advance(10).ticks).toBe(1);
  });

  it('is frame-rate independent over time', () => {
    const run = (frameMs: number) => {
      const s = new FixedStepper(60);
      let ticks = 0;
      for (let t = 0; t < 10_000; t += frameMs) ticks += s.advance(frameMs).ticks;
      return ticks;
    };
    expect(Math.abs(run(1000 / 144) - run(1000 / 30))).toBeLessThanOrEqual(1);
  });

  it('clamps huge and negative frames', () => {
    const s = new FixedStepper(50, 100);
    expect(s.advance(10_000).ticks).toBe(5);
    expect(s.advance(-50).ticks).toBe(0);
  });
});
