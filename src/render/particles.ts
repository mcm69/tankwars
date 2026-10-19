import type { Rng } from '../core/rng';
import { fillPixelCircle } from './pixels';

export type FxKind = 'spark' | 'smoke' | 'dust';

/** A presentation-only particle (the sim has its own clods and debris). */
interface Fx {
  kind: FxKind;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  color: string;
  /** Ticks before it appears (smoke waits for the fireball to die down). */
  delay: number;
}

const MAX_PARTICLES = 700;
const SPARK_COLORS = ['#ffffff', '#fff27a', '#ffc23a', '#ff7a1a'];
const SMOKE_SHADES = [90, 78, 66, 54];

/**
 * Eye-candy particles: sparks thrown from explosions, smoke rising after big ones, and dust
 * kicked up when a tank lands. They don't interact with anything and are capped in number.
 */
export class Particles {
  private list: Fx[] = [];

  constructor(private readonly rng: Rng) {}

  get count(): number {
    return this.list.length;
  }

  private add(p: Omit<Fx, 'prevX' | 'prevY' | 'age' | 'delay'>, delay = 0): void {
    if (this.list.length >= MAX_PARTICLES) return;
    this.list.push({ ...p, prevX: p.x, prevY: p.y, age: 0, delay });
  }

  /** Sparks (and smoke for bigger blasts) from an explosion. */
  explosion(x: number, y: number, radius: number): void {
    const r = this.rng;
    const sparks = Math.min(60, 6 + Math.round(radius * 0.9));
    for (let i = 0; i < sparks; i++) {
      const a = r.range(0, Math.PI * 2);
      const v = r.range(0.6, 1.6) * Math.min(4, 1 + radius / 25);
      this.add({
        kind: 'spark',
        x: x + Math.cos(a) * radius * 0.4,
        y: y + Math.sin(a) * radius * 0.4,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 1,
        life: r.int(18, 40),
        size: 1,
        color: r.pick(SPARK_COLORS),
      });
    }
    if (radius < 14) return;
    const puffs = Math.min(18, Math.round(radius / 4));
    for (let i = 0; i < puffs; i++) {
      const shade = r.pick(SMOKE_SHADES);
      this.add(
        {
          kind: 'smoke',
          x: x + r.range(-radius, radius) * 0.6,
          y: y + r.range(-radius, radius) * 0.4,
          vx: r.range(-0.15, 0.15),
          vy: -r.range(0.15, 0.45),
          life: r.int(50, 100),
          size: r.range(2, 3 + radius / 12),
          color: `${shade} ${shade} ${shade + 8}`,
        },
        Math.round(16 + radius * 0.25 + r.int(0, 10)),
      );
    }
  }

  /** Dust thrown sideways when a tank lands after a fall of `drop` pixels. */
  dust(x: number, y: number, drop: number): void {
    const r = this.rng;
    const n = Math.min(24, 4 + Math.round(drop / 3));
    for (let i = 0; i < n; i++) {
      const dir = i % 2 === 0 ? 1 : -1;
      this.add({
        kind: 'dust',
        x: x + dir * r.range(2, 8),
        y: y - r.range(0, 2),
        vx: dir * r.range(0.3, 1.4),
        vy: -r.range(0.2, 1.1),
        life: r.int(20, 40),
        size: 1,
        color: r.pick(['#c8b48a', '#a8946a', '#e0d0a8']),
      });
    }
  }

  tick(): void {
    for (const p of this.list) {
      if (p.delay > 0) {
        p.delay--;
        continue;
      }
      p.prevX = p.x;
      p.prevY = p.y;
      p.x += p.vx;
      p.y += p.vy;
      p.age++;
      if (p.kind === 'spark') {
        p.vy += 0.06;
        p.vx *= 0.97;
      } else if (p.kind === 'dust') {
        p.vy += 0.04;
        p.vx *= 0.92;
      } else {
        p.vx *= 0.98;
        p.size += 0.03;
      }
    }
    this.list = this.list.filter((p) => p.age < p.life);
  }

  clear(): void {
    this.list = [];
  }

  /** Smoke, drawn behind explosions. */
  drawBehind(ctx: CanvasRenderingContext2D, alpha: number): void {
    this.draw(ctx, alpha, true);
  }

  /** Sparks and dust, drawn in front of everything on the field. */
  drawFront(ctx: CanvasRenderingContext2D, alpha: number): void {
    this.draw(ctx, alpha, false);
  }

  private draw(ctx: CanvasRenderingContext2D, alpha: number, smoke: boolean): void {
    for (const p of this.list) {
      if (p.delay > 0 || (p.kind === 'smoke') !== smoke) continue;
      const x = Math.round(p.prevX + (p.x - p.prevX) * alpha);
      const y = Math.round(p.prevY + (p.y - p.prevY) * alpha);
      const k = p.age / p.life;
      if (p.kind === 'smoke') {
        // Fades in quickly, then out.
        const a = Math.min(1, p.age / 8) * (1 - k);
        ctx.fillStyle = `rgb(${p.color} / ${0.4 * a})`;
        fillPixelCircle(ctx, x, y, p.size);
      } else {
        // Sparks and dust blink out near the end of their life.
        if (k > 0.7 && p.age % 2 === 1) continue;
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y, p.size, p.size);
      }
    }
  }
}
