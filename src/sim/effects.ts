import { GRAVITY } from './constants';
import { blastDamage } from './damage';
import { hitsTank, tankCenter, TANK_HALF_WIDTH, TANK_HEIGHT, type Tank } from './tank';
import { Material } from './terrain';
import type { DeathStyle, World } from './world';

export interface Explosion {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  /** A harmless puff (e.g. a Lead Ball landing): no crater, no damage. */
  readonly harmless: boolean;
  readonly duration: number;
  age: number;
}

/** Chain reaction (CRI): a breadth-first burn through connected ground. */
export interface Reaction {
  readonly x: number;
  readonly y: number;
  readonly fluid: boolean;
  readonly perTick: number;
  readonly queue: number[];
  head: number;
  budget: number;
  readonly queued: Uint8Array;
  /** Cells consumed during the last tick (for the glow). */
  recent: number[];
  readonly contact: Map<number, number>;
}

export interface Particle {
  kind: 'debris' | 'clod';
  x: number;
  y: number;
  vx: number;
  vy: number;
  prevX: number;
  prevY: number;
  /** Player color index for debris. */
  readonly color: number;
  life: number;
}

export interface Beam {
  readonly points: readonly { x: number; y: number }[];
  readonly color: number;
  readonly duration: number;
  age: number;
}

export interface DirtFill {
  readonly x: number;
  readonly y: number;
  readonly radius: number;
  readonly duration: number;
  age: number;
}

export interface Wave {
  readonly x: number;
  readonly y: number;
  readonly duration: number;
  age: number;
}

export interface Dying {
  readonly tankId: number;
  readonly style: DeathStyle;
  readonly x: number;
  readonly y: number;
  readonly color: number;
  readonly duration: number;
  age: number;
}

/** A dying tank's final explosion (standard style). */
export const DEATH_BLAST = { radius: 22, damage: 80 } as const;
export const MELTDOWN_BLAST = { radius: 46, damage: 120 } as const;
export const DEBRIS_DAMAGE = 8;
const DEATH_DURATION: Record<DeathStyle, number> = { standard: 1, dirt: 1, fade: 45, meltdown: 50 };
const CRI_CONTACT_CAP = 40;
const CLOD_RADIUS = 3;

export function explosionDuration(radius: number): number {
  return Math.round(24 + radius * 0.3);
}

/**
 * All ongoing post-impact activity in a round. The round stays in its 'effects' phase while
 * any of these are active; each type advances one step per tick.
 */
export class Effects {
  readonly explosions: Explosion[] = [];
  readonly reactions: Reaction[] = [];
  readonly particles: Particle[] = [];
  readonly beams: Beam[] = [];
  readonly fills: DirtFill[] = [];
  readonly waves: Wave[] = [];
  readonly dying: Dying[] = [];

  get busy(): boolean {
    return (
      this.explosions.length +
        this.reactions.length +
        this.particles.length +
        this.beams.length +
        this.fills.length +
        this.waves.length +
        this.dying.length >
      0
    );
  }

  /** Carves a crater, damages tanks, and shows a fireball. */
  blast(world: World, x: number, y: number, radius: number, damage: number): void {
    world.terrain.carveCircle(x, y, radius);
    for (const [id, dmg] of blastDamage({ x, y, radius, damage }, world.tanks))
      world.damage(id, dmg);
    this.explosions.push({
      x,
      y,
      radius,
      harmless: false,
      duration: explosionDuration(radius),
      age: 0,
    });
    world.emit({ type: 'explode', x, y, radius, harmless: false });
  }

  puff(world: World, x: number, y: number): void {
    this.explosions.push({ x, y, radius: 4, harmless: true, duration: 18, age: 0 });
    world.emit({ type: 'explode', x, y, radius: 4, harmless: true });
  }

  /** Starts a chain reaction seeded from every dirt cell within a few pixels of (x, y). */
  reaction(world: World, x: number, y: number, budget: number, fluid: boolean): void {
    const { terrain } = world;
    const queued = new Uint8Array(terrain.width * terrain.height);
    const queue: number[] = [];
    const r = 7;
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        const cx = Math.round(x) + dx;
        const cy = Math.round(y) + dy;
        if (!terrain.inBounds(cx, cy) || terrain.get(cx, cy) === Material.Air) continue;
        const i = cy * terrain.width + cx;
        queued[i] = 1;
        queue.push(i);
      }
    }
    if (queue.length === 0) return;
    this.reactions.push({
      x,
      y,
      fluid,
      perTick: fluid ? 220 : 90,
      queue,
      head: 0,
      budget,
      queued,
      recent: [],
      contact: new Map(),
    });
    world.emit({ type: 'reaction', x, y });
  }

  dirtFill(world: World, x: number, y: number, radius: number): void {
    this.fills.push({ x, y, radius, duration: 12, age: 0 });
    world.emit({ type: 'dirt', x, y, radius });
  }

  wave(world: World, x: number, y: number): void {
    this.waves.push({ x, y, duration: 50, age: 0 });
    world.emit({ type: 'sonic', x, y });
  }

  beam(points: { x: number; y: number }[], color: number): void {
    this.beams.push({ points, color, duration: 26, age: 0 });
  }

  /** Sprays dirt clods upward from (x, y). */
  clods(world: World, x: number, y: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.PI / 2 + world.rng.range(-1.1, 1.1);
      const speed = world.rng.range(1.8, 4.6);
      this.particles.push({
        kind: 'clod',
        x,
        y: y - 2,
        prevX: x,
        prevY: y - 2,
        vx: Math.cos(a) * speed,
        vy: -Math.sin(a) * speed,
        color: 0,
        life: world.rng.int(18, 48),
      });
    }
  }

  /** Flaming bits of a destroyed tank. */
  debris(world: World, x: number, y: number, color: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = world.rng.range(0.15, Math.PI - 0.15);
      const speed = world.rng.range(1.5, 4.5);
      this.particles.push({
        kind: 'debris',
        x,
        y,
        prevX: x,
        prevY: y,
        vx: Math.cos(a) * speed,
        vy: -Math.sin(a) * speed,
        color,
        life: 400,
      });
    }
  }

  startDeath(world: World, t: Tank, style: DeathStyle): void {
    const c = tankCenter(t);
    this.dying.push({
      tankId: t.id,
      style,
      x: c.x,
      y: c.y,
      color: t.color,
      duration: DEATH_DURATION[style],
      age: 0,
    });
    world.emit({ type: 'tankDied', tankId: t.id, style });
  }

  tick(world: World): void {
    for (const e of this.explosions) e.age++;
    removeWhere(this.explosions, (e) => e.age >= e.duration);

    for (const f of this.fills) {
      f.age++;
      world.terrain.fillCircle(f.x, f.y, f.radius * Math.min(1, f.age / f.duration));
    }
    removeWhere(this.fills, (f) => f.age >= f.duration);

    for (const r of this.reactions) stepReaction(world, r);
    removeWhere(this.reactions, (r) => {
      const done = r.head >= r.queue.length || r.budget <= 0;
      if (done) for (const [id, dmg] of r.contact) world.damage(id, dmg);
      return done;
    });

    for (const p of this.particles) stepParticle(world, p);
    removeWhere(this.particles, (p) => p.life <= 0);

    for (const b of this.beams) b.age++;
    removeWhere(this.beams, (b) => b.age >= b.duration);
    for (const w of this.waves) w.age++;
    removeWhere(this.waves, (w) => w.age >= w.duration);

    for (const d of this.dying) {
      d.age++;
      if (d.age >= d.duration) this.finishDeath(world, d);
    }
    removeWhere(this.dying, (d) => d.age >= d.duration);
  }

  private finishDeath(world: World, d: Dying): void {
    switch (d.style) {
      case 'standard':
        this.blast(world, d.x, d.y, DEATH_BLAST.radius, DEATH_BLAST.damage);
        this.debris(world, d.x, d.y - 2, d.color, 16);
        break;
      case 'dirt':
        this.puff(world, d.x, d.y);
        this.dirtFill(world, d.x, d.y, 24);
        break;
      case 'fade':
        break;
      case 'meltdown':
        this.blast(world, d.x, d.y, MELTDOWN_BLAST.radius, MELTDOWN_BLAST.damage);
        this.debris(world, d.x, d.y - 2, d.color, 10);
        break;
    }
  }
}

function stepReaction(world: World, r: Reaction): void {
  const { terrain, tanks, rng } = world;
  const { width, height, cells } = terrain;
  r.recent = [];
  const neighbors = r.fluid
    ? [-1, 1, -width, width, -width - 1, -width + 1, width - 1, width + 1]
    : [-1, 1, -width, width];
  const spread = r.fluid ? 0.6 : 0.52;
  let n = r.perTick;
  while (n-- > 0 && r.head < r.queue.length && r.budget > 0) {
    const c = r.queue[r.head++]!;
    if (cells[c] === Material.Air) continue;
    const x = c % width;
    const y = (c - x) / width;
    terrain.set(x, y, Material.Air);
    r.budget--;
    r.recent.push(c);
    for (const t of tanks) {
      if (!t.alive) continue;
      if (Math.abs(x - t.x) <= TANK_HALF_WIDTH + 2 && y >= t.y - TANK_HEIGHT - 2 && y <= t.y + 2) {
        r.contact.set(t.id, Math.min(CRI_CONTACT_CAP, (r.contact.get(t.id) ?? 0) + 1));
      }
    }
    for (const off of neighbors) {
      const ni = c + off;
      if (ni < 0 || ni >= width * height) continue;
      // Skip row wrap-around at the left/right edges.
      const nx = ni % width;
      if (Math.abs(nx - x) > 1) continue;
      if (r.queued[ni] || cells[ni] === Material.Air) continue;
      if (!rng.chance(spread)) continue;
      r.queued[ni] = 1;
      r.queue.push(ni);
    }
  }
}

function stepParticle(world: World, p: Particle): void {
  const { terrain, tanks } = world;
  p.prevX = p.x;
  p.prevY = p.y;
  p.life--;
  p.vy += GRAVITY;
  if (p.kind === 'clod' && p.life <= 0) {
    // Ran out of steam mid-air: it stays there as floating dirt (crumble may drop it later).
    terrain.fillCircle(p.x, p.y, CLOD_RADIUS);
    return;
  }
  const steps = Math.max(1, Math.ceil(Math.hypot(p.vx, p.vy)));
  for (let i = 0; i < steps; i++) {
    const lx = p.x;
    const ly = p.y;
    p.x += p.vx / steps;
    p.y += p.vy / steps;
    if (p.x < 0 || p.x >= terrain.width || p.y >= terrain.height) {
      p.life = 0;
      return;
    }
    if (p.kind === 'debris' && world.options.explosionsKill) {
      const hit = tanks.find((t) => hitsTank(t, p.x, p.y));
      if (hit) {
        world.damage(hit.id, DEBRIS_DAMAGE);
        terrain.carveCircle(p.x, p.y, 2);
        p.life = 0;
        return;
      }
    }
    if (terrain.isSolid(p.x, p.y)) {
      if (p.kind === 'clod') terrain.fillCircle(lx, ly, CLOD_RADIUS);
      else terrain.carveCircle(p.x, p.y, 2);
      p.life = 0;
      return;
    }
  }
}

function removeWhere<T>(arr: T[], pred: (v: T) => boolean): void {
  let w = 0;
  for (const v of arr) if (!pred(v)) arr[w++] = v;
  arr.length = w;
}
