import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';

const take = (rng: Rng, n: number) => Array.from({ length: n }, () => rng.nextUint32());

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    expect(take(new Rng(42), 100)).toEqual(take(new Rng(42), 100));
  });

  it('produces different streams for adjacent seeds', () => {
    const a = take(new Rng(1), 20);
    const b = take(new Rng(2), 20);
    expect(a.filter((v, i) => v === b[i])).toHaveLength(0);
  });

  it('pins the first outputs so the algorithm cannot change silently', () => {
    // Changing these breaks saved games and replays: bump a save version if you must.
    expect(take(new Rng(1991), 3)).toMatchInlineSnapshot(`
      [
        2326197653,
        1453756185,
        3045584713,
      ]
    `);
  });

  it('restores from saved state', () => {
    const rng = new Rng(7);
    take(rng, 50);
    const copy = Rng.fromState(rng.getState());
    expect(take(copy, 50)).toEqual(take(rng, 50));
  });

  it('keeps float() in [0, 1) and int() inclusive in range', () => {
    const rng = new Rng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 10_000; i++) {
      const f = rng.float();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
      const n = rng.int(-2, 2);
      expect(n).toBeGreaterThanOrEqual(-2);
      expect(n).toBeLessThanOrEqual(2);
      seen.add(n);
    }
    expect([...seen].sort((x, y) => x - y)).toEqual([-2, -1, 0, 1, 2]);
  });

  it('is roughly uniform', () => {
    const rng = new Rng(99);
    const buckets = new Array<number>(10).fill(0);
    const n = 100_000;
    for (let i = 0; i < n; i++) buckets[Math.floor(rng.float() * 10)]!++;
    for (const count of buckets) expect(Math.abs(count - n / 10)).toBeLessThan(n / 100);
  });

  it('shuffle is a permutation and deterministic', () => {
    const items = Array.from({ length: 10 }, (_, i) => i);
    const a = new Rng(5).shuffle([...items]);
    const b = new Rng(5).shuffle([...items]);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
  });

  it('rejects invalid arguments', () => {
    const rng = new Rng(0);
    expect(() => rng.int(3, 1)).toThrow(RangeError);
    expect(() => rng.pick([])).toThrow(RangeError);
  });
});
