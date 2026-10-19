import { LAYOUT } from '../config';
import type { Rng } from '../core/rng';
import { itemIndex } from '../sim/items';
import { SHIELD_COST_PER_DAMAGE, type Round, type RoundEvent } from '../sim/round';
import { BARREL_LENGTH, TANK_HALF_WIDTH, TURRET_PIVOT } from '../sim/tank';
import { drawText, drawTextShadow } from './font';
import { Shake, shakeForRadius } from './motion';
import { Particles } from './particles';
import { drawPixelLine, fillPixelCircle, strokePixelCircle } from './pixels';
import { lighten, PLAYER_COLORS, SPRITE_HEIGHT, tankSprite } from './tank-sprite';

const FIRE_COLORS = ['#ffffff', '#fff27a', '#ffc23a', '#ff7a1a', '#e0321e', '#9a1a14'];
const SHIELD_ENERGY = itemIndex('shieldEnergy');
const PUFF_COLORS = ['#ffffff', '#d8d8e0', '#a8a8b8', '#787888'];
const CRI_COLORS = ['#ffffff', '#d4ff6a', '#6aff8a'];
/** Explosions this big get a flash and shockwave ring. */
const NUKE_RADIUS = 55;
/** Turret angles further than this from the sim's ease toward it instead of snapping. */
const TURRET_SNAP = 3;
const TURRET_EASE = 0.4;
/** Falls shorter than this don't kick up dust. */
const DUST_MIN_DROP = 3;

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
}

/**
 * Draws everything on the battlefield except terrain, sky and trails: tanks, shots,
 * explosions, the aim preview, floating damage numbers, and the round-over banner.
 */
export class BattleRenderer {
  private floaters: Floater[] = [];
  /** Ticks left of a shield flash, per tank. */
  private readonly flashes = new Map<number, number>();
  readonly particles: Particles;
  readonly shake = new Shake();
  /** Set by the scene each frame from the settings. */
  shakeEnabled = true;
  reducedMotion = false;
  /** Drawn turret angle per tank, easing toward the sim's angle. */
  private readonly turret = new Map<number, number>();
  private readonly lastY = new Map<number, number>();
  /** y where each falling tank started, for landing dust. */
  private readonly fallFrom = new Map<number, number>();

  constructor(rng: Rng) {
    this.particles = new Particles(rng);
  }

  /** Feed sim events to spawn presentation-only effects. */
  onEvents(round: Round, events: readonly RoundEvent[]): void {
    for (const e of events) {
      if (e.type === 'explode' && !e.harmless) {
        this.particles.explosion(e.x, e.y, e.radius);
        this.kick(shakeForRadius(e.radius));
      }
      if (e.type === 'tankDied') this.kick(e.style === 'meltdown' ? 5 : 2);
      if (e.type === 'shieldHit') {
        const t = round.tanks[e.tankId]!;
        this.flashes.set(t.id, 12);
        this.floaters.push({
          x: t.x,
          y: t.y - 30,
          text: `${e.kind === 'fall' ? 'damper' : 'shield'} ${e.absorbed}`,
          color: '#3fe6e6',
          age: 0,
        });
      }
      if (e.type === 'dud') {
        const t = round.tanks[e.tankId]!;
        this.floaters.push({ x: t.x, y: t.y - 30, text: 'DUD!', color: '#ffffff', age: 0 });
      }
      if (e.type === 'tankHit') {
        const t = round.tanks[e.tankId]!;
        this.floaters.push({
          x: t.x,
          y: t.y - 20,
          text: `-${e.damage}`,
          color: PLAYER_COLORS[t.color]!,
          age: 0,
        });
      }
    }
  }

  private kick(pixels: number): void {
    if (this.shakeEnabled && !this.reducedMotion && pixels > 0) this.shake.kick(pixels);
  }

  /** Field-space drawing; the caller has translated the context to the field origin. */
  drawField(
    ctx: CanvasRenderingContext2D,
    round: Round,
    alpha: number,
    visibleShot: boolean,
    aimPreview: { x: number; y: number } | null,
  ): void {
    const fx = round.effects;
    for (const t of round.tanks) {
      if (!t.alive) continue;
      this.drawTank(ctx, t);
      // Energy shield bubble, brighter while it's soaking a hit.
      if ((t.inventory[SHIELD_ENERGY] ?? 0) >= SHIELD_COST_PER_DAMAGE) {
        const flash = this.flashes.get(t.id) ?? 0;
        ctx.fillStyle =
          flash > 0 ? `rgb(160 255 255 / ${0.4 + flash / 20})` : 'rgb(63 230 230 / 35%)';
        strokePixelCircle(ctx, t.x, t.y - 4, 11);
      }
    }
    // Tanks in their death throes: fading out, or pulsing toward meltdown.
    for (const d of fx.dying) {
      const t = round.tanks[d.tankId]!;
      const k = d.age / d.duration;
      if (d.style === 'fade') {
        ctx.save();
        ctx.globalAlpha = 1 - k;
        this.drawTank(ctx, t);
        ctx.restore();
      } else if (d.style === 'meltdown') {
        const flash = Math.floor(d.age / Math.max(2, 8 - k * 6)) % 2 === 0;
        this.drawTank(ctx, t, flash ? '#ffffff' : '#ff3a1a');
        ctx.fillStyle = 'rgb(255 80 40 / 35%)';
        fillPixelCircle(ctx, d.x, d.y, 6 + k * 14);
      } else {
        this.drawTank(ctx, t);
      }
    }

    const cur = round.current;
    if (cur?.alive && round.phase === 'aiming') {
      // Bobbing marker above the tank whose turn it is.
      const bob = Math.floor(round.tickCount / 15) % 2;
      ctx.fillStyle = PLAYER_COLORS[cur.color]!;
      const mx = Math.round(cur.x);
      const my = Math.round(cur.y) - 24 - bob;
      ctx.fillRect(mx - 3, my, 7, 1);
      ctx.fillRect(mx - 2, my + 1, 5, 1);
      ctx.fillRect(mx - 1, my + 2, 3, 1);
      ctx.fillRect(mx, my + 3, 1, 1);

      if (cur.guidance) {
        // Crosshair on the guidance target, in the shooter's color.
        const tg = round.tanks[cur.guidance.targetId];
        if (tg?.alive) {
          const x = Math.round(tg.x);
          const y = Math.round(tg.y - 4);
          ctx.fillStyle = PLAYER_COLORS[cur.color]!;
          ctx.fillRect(x - 12, y, 5, 1);
          ctx.fillRect(x + 8, y, 5, 1);
          ctx.fillRect(x, y - 12, 1, 5);
          ctx.fillRect(x, y + 8, 1, 5);
          drawText(ctx, cur.guidance.axis, x + 10, y - 14, PLAYER_COLORS[cur.color]!);
        }
      }

      if (aimPreview) {
        // Dotted guide from the turret along the aim, length proportional to power.
        const a = (cur.angle * Math.PI) / 180;
        const len = 12 + (cur.power / 1000) * 120;
        const px = cur.x;
        const py = cur.y - TURRET_PIVOT;
        ctx.fillStyle = 'rgb(255 255 255 / 75%)';
        for (let d = 12; d < len; d += 4) {
          ctx.fillRect(Math.round(px + Math.cos(a) * d), Math.round(py - Math.sin(a) * d), 1, 1);
        }
        ctx.fillStyle = 'rgb(255 255 255 / 40%)';
        ctx.fillRect(Math.round(aimPreview.x) - 1, Math.round(aimPreview.y), 3, 1);
        ctx.fillRect(Math.round(aimPreview.x), Math.round(aimPreview.y) - 1, 1, 3);
      }
    }

    const p = round.projectile;
    if (p && visibleShot) {
      const px = Math.round(p.prevX + (p.x - p.prevX) * alpha);
      const py = Math.round(p.prevY + (p.y - p.prevY) * alpha);
      ctx.fillStyle = '#ffe9a0';
      ctx.fillRect(px - 1, py - 1, 3, 3);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(px, py, 1, 1);
      this.drawTracking(ctx, px, py, round.terrain.width);
    }

    this.particles.drawBehind(ctx, alpha);
    this.drawEffects(ctx, round, alpha);
    this.particles.drawFront(ctx, alpha);

    for (const f of this.floaters) {
      drawTextShadow(ctx, f.text, f.x, f.y - f.age / 3, f.color, 1, 'center');
    }
  }

  private drawTank(
    ctx: CanvasRenderingContext2D,
    t: Round['tanks'][number],
    override?: string,
  ): void {
    const x = Math.round(t.x);
    const y = Math.round(t.y);
    const color = override ?? PLAYER_COLORS[t.color]!;
    const a = ((this.turret.get(t.id) ?? t.angle) * Math.PI) / 180;
    ctx.fillStyle = lighten(color, 0.2);
    drawPixelLine(
      ctx,
      x,
      y - TURRET_PIVOT,
      x + Math.cos(a) * BARREL_LENGTH,
      y - TURRET_PIVOT - Math.sin(a) * BARREL_LENGTH,
    );
    ctx.drawImage(tankSprite(color), x - TANK_HALF_WIDTH, y - SPRITE_HEIGHT);
  }

  private drawEffects(ctx: CanvasRenderingContext2D, round: Round, alpha: number): void {
    const fx = round.effects;
    const width = round.terrain.width;

    // Chain reactions: the cells consumed this tick glow, plus a sample of the frontier.
    for (const r of fx.reactions) {
      for (let i = 0; i < r.recent.length; i++) {
        const c = r.recent[i]!;
        ctx.fillStyle = CRI_COLORS[(c + round.tickCount) % CRI_COLORS.length]!;
        ctx.fillRect(c % width, Math.floor(c / width), 1, 1);
      }
      ctx.fillStyle = '#3aff6a';
      const end = Math.min(r.queue.length, r.head + 600);
      for (let i = r.head; i < end; i += 2) {
        const c = r.queue[i]!;
        ctx.fillRect(c % width, Math.floor(c / width), 1, 1);
      }
    }

    for (const e of fx.explosions) {
      const grow = Math.min(1, (e.age + alpha) / 6);
      const fadeStart = e.duration - 10;
      const fade = Math.max(0, (e.age - fadeStart) / 10);
      const r = e.radius * grow * (1 - fade * 0.6);
      const colors = e.harmless ? PUFF_COLORS : FIRE_COLORS;
      const ci = Math.min(colors.length - 1, Math.floor((e.age / e.duration) * colors.length));
      if (!e.harmless && e.radius >= NUKE_RADIUS) {
        // Shockwave ring racing outward, and a white flash for the first frames.
        ctx.fillStyle = 'rgb(255 255 230 / 60%)';
        strokePixelCircle(ctx, e.x, e.y, e.radius * Math.min(1.8, (e.age + alpha) / 8));
        if (e.age < 4) {
          // Reduced motion keeps the flash, but dim, for photosensitive players.
          const peak = this.reducedMotion ? 0.2 : 0.7;
          ctx.fillStyle = `rgb(255 255 255 / ${peak - e.age * peak * 0.2})`;
          ctx.fillRect(0, 0, width, round.terrain.height);
        }
      }
      ctx.fillStyle = colors[Math.min(colors.length - 1, ci + 1)]!;
      fillPixelCircle(ctx, e.x, e.y, r);
      ctx.fillStyle = colors[ci]!;
      fillPixelCircle(ctx, e.x, e.y, r * 0.6);
      if (!e.harmless && e.age < 3) {
        // A hot white flash, a little larger than the fireball, for the first frames.
        ctx.fillStyle = `rgb(255 255 240 / ${0.55 - e.age * 0.18})`;
        fillPixelCircle(ctx, e.x, e.y, e.radius * 1.2);
      }
    }

    for (const w of fx.waves) {
      const k = (w.age + alpha) / w.duration;
      ctx.fillStyle = `rgb(140 200 255 / ${Math.max(0, 0.8 - k * 0.8)})`;
      for (let ring = 0; ring < 3; ring++) {
        const rr = k * 700 - ring * 18;
        if (rr > 0) strokePixelCircle(ctx, w.x, w.y, rr);
      }
    }

    for (const b of fx.beams) {
      const k = b.age / b.duration;
      const flicker = b.age % 4 < 2;
      ctx.fillStyle = flicker ? '#ffffff' : '#ff3a3a';
      ctx.globalAlpha = 1 - k * 0.8;
      for (let i = 1; i < b.points.length; i++) {
        const p0 = b.points[i - 1]!;
        const p1 = b.points[i]!;
        drawPixelLine(ctx, p0.x, p0.y, p1.x, p1.y, flicker ? 2 : 3);
      }
      ctx.globalAlpha = 1;
    }

    for (const p of fx.particles) {
      const x = Math.round(p.prevX + (p.x - p.prevX) * alpha);
      const y = Math.round(p.prevY + (p.y - p.prevY) * alpha);
      if (p.kind === 'clod') {
        ctx.fillStyle = '#a0663a';
        ctx.fillRect(x - 1, y - 1, 3, 3);
      } else {
        ctx.fillStyle = round.tickCount % 4 < 2 ? '#ffd23a' : PLAYER_COLORS[p.color]!;
        ctx.fillRect(x, y, 2, 1);
      }
    }
  }

  /**
   * "Tracking bars": when the shell is above or beside the field, a marker on that edge shows
   * where it is, with a bar whose length grows with its distance from the field.
   */
  private drawTracking(ctx: CanvasRenderingContext2D, px: number, py: number, width: number) {
    ctx.fillStyle = '#ffe9a0';
    if (py < 0) {
      const x = Math.min(width - 3, Math.max(2, px));
      const bar = Math.min(24, Math.ceil(-py / 25));
      ctx.fillRect(x - 2, 0, 5, 1);
      ctx.fillRect(x - 1, 1, 3, 1);
      ctx.fillRect(x, 2, 1, 2 + bar);
    }
    if (px < 0 || px >= width) {
      const left = px < 0;
      const edge = left ? 0 : width - 1;
      const dir = left ? 1 : -1;
      const y = Math.min(LAYOUT.field.h - 3, Math.max(2, py));
      const bar = Math.min(24, Math.ceil((left ? -px : px - width) / 25));
      ctx.fillRect(edge, y - 2, 1, 5);
      ctx.fillRect(edge + dir, y - 1, 1, 3);
      ctx.fillRect(left ? 2 : width - 4 - bar, y, 2 + bar, 1);
    }
  }

  /** Advances presentation-only animations; call once per sim tick. */
  tick(round: Round): void {
    this.particles.tick();
    this.shake.tick();
    for (const t of round.tanks) {
      const shown = this.turret.get(t.id);
      const d = shown === undefined ? 0 : t.angle - shown;
      this.turret.set(t.id, Math.abs(d) <= TURRET_SNAP ? t.angle : shown! + d * TURRET_EASE);

      const prev = this.lastY.get(t.id);
      this.lastY.set(t.id, t.y);
      if (prev === undefined || !t.alive) continue;
      if (t.y > prev) {
        if (!this.fallFrom.has(t.id)) this.fallFrom.set(t.id, prev);
      } else if (this.fallFrom.has(t.id)) {
        const drop = t.y - this.fallFrom.get(t.id)!;
        this.fallFrom.delete(t.id);
        if (drop >= DUST_MIN_DROP) {
          this.particles.dust(t.x, t.y, drop);
          this.kick(Math.min(3, drop / 25));
        }
      }
    }
    for (const [id, n] of this.flashes) {
      if (n <= 1) this.flashes.delete(id);
      else this.flashes.set(id, n - 1);
    }
    for (const f of this.floaters) f.age++;
    this.floaters = this.floaters.filter((f) => f.age < 60);
  }

  drawRoundOver(ctx: CanvasRenderingContext2D, round: Round): void {
    if (round.phase !== 'roundOver') return;
    const { field } = LAYOUT;
    const winner = round.winnerId === null ? null : round.tanks[round.winnerId]!;
    const cx = field.x + field.w / 2;
    const cy = field.y + field.h / 2;
    ctx.fillStyle = 'rgb(0 0 0 / 65%)';
    ctx.fillRect(cx - 170, cy - 30, 340, 60);
    drawTextShadow(
      ctx,
      winner ? `${winner.name} wins!` : 'Nobody survived!',
      cx,
      cy - 18,
      winner ? PLAYER_COLORS[winner.color]! : '#ffffff',
      3,
      'center',
    );
    drawText(ctx, 'Press any key to continue', cx, cy + 12, '#cccccc', 1, 'center');
  }
}
