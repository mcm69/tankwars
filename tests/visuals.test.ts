import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { DEFAULT_SETTINGS } from '../src/game/settings';
import { sanitizeSettings } from '../src/persist/storage';
import { RANDOM_POOL, resolveBackground } from '../src/render/backgrounds';
import {
  effectiveBackgroundSpeed,
  motionReduced,
  Shake,
  shakeForRadius,
} from '../src/render/motion';
import { Particles } from '../src/render/particles';
import { healthColor } from '../src/render/tank-sprite';

describe('reduced motion', () => {
  it('follows the system on auto, and can be forced either way', () => {
    expect(motionReduced({ motion: 'auto' }, true)).toBe(true);
    expect(motionReduced({ motion: 'auto' }, false)).toBe(false);
    expect(motionReduced({ motion: 'reduced' }, false)).toBe(true);
    expect(motionReduced({ motion: 'full' }, true)).toBe(false);
  });

  it('stills the background', () => {
    expect(effectiveBackgroundSpeed({ motion: 'auto', backgroundSpeed: 8 }, true)).toBe(0);
    expect(effectiveBackgroundSpeed({ motion: 'auto', backgroundSpeed: 8 }, false)).toBe(8);
    expect(effectiveBackgroundSpeed({ motion: 'full', backgroundSpeed: 3 }, true)).toBe(3);
  });

  it('defaults to auto with shake on, and sanitizes saved values', () => {
    expect(DEFAULT_SETTINGS.motion).toBe('auto');
    expect(DEFAULT_SETTINGS.screenShake).toBe(true);
    const s = sanitizeSettings({ motion: 'reduced', screenShake: false });
    expect(s.motion).toBe('reduced');
    expect(s.screenShake).toBe(false);
    const bad = sanitizeSettings({ motion: 'wobbly', screenShake: 'yes' });
    expect(bad.motion).toBe('auto');
    expect(bad.screenShake).toBe(true);
  });
});

describe('backgrounds', () => {
  it('resolves Random to an animated background, deterministically per seed', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed < 200; seed++) {
      const a = resolveBackground('random', new Rng(seed));
      expect(RANDOM_POOL).toContain(a);
      expect(resolveBackground('random', new Rng(seed))).toBe(a);
      seen.add(a);
    }
    expect(seen.size).toBe(RANDOM_POOL.length);
    expect(resolveBackground('circles', new Rng(1))).toBe('circles');
  });
});

describe('screen shake', () => {
  it('scales with blast size, decays to rest, and never moves up', () => {
    expect(shakeForRadius(8)).toBe(0);
    expect(shakeForRadius(30)).toBeGreaterThan(shakeForRadius(15));
    expect(shakeForRadius(500)).toBeLessThanOrEqual(6);
    const s = new Shake();
    s.kick(6);
    let moved = false;
    for (let i = 0; i < 60; i++) {
      s.tick();
      if (s.x !== 0 || s.y !== 0) moved = true;
      expect(s.y).toBeGreaterThanOrEqual(0);
      expect(Math.abs(s.x)).toBeLessThanOrEqual(3);
    }
    expect(moved).toBe(true);
    expect([s.x, s.y]).toEqual([0, 0]);
  });
});

describe('particles', () => {
  it('spawns sparks and delayed smoke, then dies out', () => {
    const p = new Particles(new Rng(5));
    p.explosion(100, 100, 40);
    const n = p.count;
    expect(n).toBeGreaterThan(20);
    for (let i = 0; i < 400; i++) p.tick();
    expect(p.count).toBe(0);
  });

  it('caps the total', () => {
    const p = new Particles(new Rng(5));
    for (let i = 0; i < 100; i++) p.explosion(100, 100, 300);
    expect(p.count).toBeLessThanOrEqual(700);
  });
});

describe('tank health color', () => {
  it('darkens the player color toward black as health drops', () => {
    expect(healthColor('#ff4848', 100)).toBe('#ff4848');
    expect(healthColor('#ff4848', 50)).toBe('#802424');
    expect(healthColor('#ff4848', 0)).toBe('#000000');
    expect(healthColor('#ff4848', 52)).toBe(healthColor('#ff4848', 50));
  });
});
