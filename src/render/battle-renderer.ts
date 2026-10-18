import { LAYOUT } from '../config';
import type { Round, RoundEvent } from '../sim/round';
import { BARREL_LENGTH, TANK_HALF_WIDTH, TURRET_PIVOT } from '../sim/tank';
import { drawText, drawTextShadow } from './font';
import { drawPixelLine, fillPixelCircle, strokePixelCircle } from './pixels';
import { lighten, PLAYER_COLORS, SPRITE_HEIGHT, tankSprite } from './tank-sprite';

const FIRE_COLORS = ['#ffffff', '#fff27a', '#ffc23a', '#ff7a1a', '#e0321e', '#9a1a14'];
const PUFF_COLORS = ['#ffffff', '#d8d8e0', '#a8a8b8', '#787888'];
const CRI_COLORS = ['#ffffff', '#d4ff6a', '#6aff8a'];
/** Explosions this big get a flash and shockwave ring. */
const NUKE_RADIUS = 55;

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

  /** Feed sim events to spawn presentation-only effects. */
  onEvents(round: Round, events: readonly RoundEvent[]): void {
    for (const e of events) {
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
      if (t.alive) this.drawTank(ctx, t);
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

    this.drawEffects(ctx, round, alpha);

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
    const a = (t.angle * Math.PI) / 180;
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
          ctx.fillStyle = `rgb(255 255 255 / ${0.7 - e.age * 0.15})`;
          ctx.fillRect(0, 0, width, round.terrain.height);
        }
      }
      ctx.fillStyle = colors[Math.min(colors.length - 1, ci + 1)]!;
      fillPixelCircle(ctx, e.x, e.y, r);
      ctx.fillStyle = colors[ci]!;
      fillPixelCircle(ctx, e.x, e.y, r * 0.6);
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
  tick(): void {
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
