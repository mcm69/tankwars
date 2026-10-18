import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { FIELD_HEIGHT, FIELD_WIDTH } from '../src/sim/constants';
import { Material, Terrain } from '../src/sim/terrain';
import { generateSurface, generateTerrain, TERRAIN_STYLES } from '../src/sim/terrain-gen';

const countSolid = (t: Terrain) => t.cells.reduce((n, c) => n + (c !== Material.Air ? 1 : 0), 0);

describe('Terrain primitives', () => {
  it('treats out-of-bounds as air and ignores out-of-bounds writes', () => {
    const t = new Terrain(10, 10);
    t.set(-1, 0, Material.Dirt);
    t.set(0, 10, Material.Dirt);
    expect(countSolid(t)).toBe(0);
    expect(t.get(-5, 3)).toBe(Material.Air);
    expect(t.isSolid(100, 100)).toBe(false);
  });

  it('finds the surface of a column', () => {
    const t = new Terrain(4, 10);
    t.fillFromSurface([3, 0, 10, 9]);
    expect([0, 1, 2, 3].map((x) => t.surfaceY(x))).toEqual([3, 0, 10, 9]);
    expect(t.surfaceY(-1)).toBe(10);
  });

  it('carves a disc of the expected area and reports cells removed', () => {
    const t = new Terrain(100, 100);
    t.fillFromSurface(new Array(100).fill(0));
    const removed = t.carveCircle(50, 50, 20);
    expect(removed).toBe(10000 - countSolid(t));
    expect(Math.abs(removed - Math.PI * 400) / (Math.PI * 400)).toBeLessThan(0.03);
    expect(t.isSolid(50, 50)).toBe(false);
    expect(t.isSolid(50, 75)).toBe(true);
    expect(t.carveCircle(50, 50, 20)).toBe(0);
  });

  it('fill only adds where there was air', () => {
    const t = new Terrain(50, 50);
    t.fillFromSurface(new Array(50).fill(25));
    const before = countSolid(t);
    const added = t.fillCircle(25, 25, 10);
    expect(countSolid(t)).toBe(before + added);
    expect(added).toBeGreaterThan(0);
    expect(added).toBeLessThan(Math.PI * 100);
  });

  it('clips circles at the edges', () => {
    const t = new Terrain(20, 20);
    expect(() => t.fillCircle(0, 0, 50)).not.toThrow();
    expect(countSolid(t)).toBe(400);
  });

  it('tracks the dirty rect as a union of changes and clears on take', () => {
    const t = new Terrain(100, 100);
    expect(t.takeDirty()).toEqual({ x0: 0, y0: 0, x1: 99, y1: 99 });
    expect(t.takeDirty()).toBeNull();
    t.fillCircle(10, 10, 3);
    t.set(80, 90, Material.Dirt);
    const d = t.takeDirty()!;
    expect(d.x0).toBeLessThanOrEqual(7);
    expect(d.y0).toBeLessThanOrEqual(7);
    expect(d.x1).toBe(80);
    expect(d.y1).toBe(90);
    t.carveCircle(50, 50, 5); // nothing to carve: no change, no dirty
    expect(t.takeDirty()).toBeNull();
  });
});

describe('Terrain generation', () => {
  it('is deterministic per seed', () => {
    const a = generateTerrain(new Rng(123), FIELD_WIDTH, FIELD_HEIGHT);
    const b = generateTerrain(new Rng(123), FIELD_WIDTH, FIELD_HEIGHT);
    expect(a.style).toBe(b.style);
    expect(a.terrain.cells).toEqual(b.terrain.cells);
  });

  it.each(TERRAIN_STYLES)('%s: surfaces stay inside the allowed band', (style) => {
    for (let seed = 0; seed < 25; seed++) {
      const { surface } = generateSurface(new Rng(seed), FIELD_WIDTH, FIELD_HEIGHT, { style });
      for (const y of surface) {
        expect(y).toBeGreaterThanOrEqual(Math.round(FIELD_HEIGHT * 0.18));
        expect(y).toBeLessThanOrEqual(Math.round(FIELD_HEIGHT * 0.9));
      }
    }
  });

  it.each(TERRAIN_STYLES)('%s: produces varied, gap-free ground', (style) => {
    const { terrain } = generateTerrain(new Rng(7), FIELD_WIDTH, FIELD_HEIGHT, { style });
    const tops = Array.from({ length: FIELD_WIDTH }, (_, x) => terrain.surfaceY(x));
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(FIELD_HEIGHT * 0.3);
    for (let x = 0; x < FIELD_WIDTH; x++) {
      for (let y = tops[x]!; y < FIELD_HEIGHT; y++) expect(terrain.get(x, y)).toBe(Material.Dirt);
    }
  });
});
