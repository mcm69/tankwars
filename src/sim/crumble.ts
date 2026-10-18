import { Material, type Terrain } from './terrain';

/**
 * Loose-ground collapse, one pixel at a time: in each column, every run of dirt that has air
 * directly below it moves down one pixel. Repeated passes animate overhangs and floating dirt
 * falling until everything rests on something.
 */
export class Crumbler {
  /** Columns that might still have loose dirt. */
  private active: number[];

  constructor(private readonly terrain: Terrain) {
    this.active = Array.from({ length: terrain.width }, (_, x) => x);
  }

  /** Runs one pass. Returns true if anything moved. */
  pass(): boolean {
    const { cells, width, height } = this.terrain;
    const still: number[] = [];
    for (const x of this.active) {
      let moved = false;
      let topMoved = height;
      let bottomMoved = -1;
      // Bottom-up: each air cell with dirt above swaps with it, which shifts a whole
      // floating run down by exactly one pixel per pass.
      for (let y = height - 1; y > 0; y--) {
        const i = y * width + x;
        if (cells[i] === Material.Air && cells[i - width] !== Material.Air) {
          cells[i] = cells[i - width]!;
          cells[i - width] = Material.Air;
          moved = true;
          topMoved = y - 1;
          if (bottomMoved < 0) bottomMoved = y;
        }
      }
      if (moved) {
        still.push(x);
        this.terrain.markDirty(x, topMoved, x, bottomMoved);
      }
    }
    this.active = still;
    return still.length > 0;
  }

  /** Collapses everything immediately (tests and headless use). */
  settleAll(): void {
    while (this.pass()) {
      /* keep going */
    }
  }
}

/** True if any column has dirt with air somewhere below it. */
export function hasLooseDirt(terrain: Terrain): boolean {
  const { cells, width, height } = terrain;
  for (let x = 0; x < width; x++) {
    let seenDirt = false;
    for (let y = 0; y < height; y++) {
      const solid = cells[y * width + x] !== Material.Air;
      if (solid) seenDirt = true;
      else if (seenDirt) return true;
    }
  }
  return false;
}
