import { LAYOUT } from '../config';
import { EXPLOSION_TICKS } from '../sim/constants';
import type { Round, RoundEvent } from '../sim/round';
import { BARREL_LENGTH, displayAngle, TANK_HALF_WIDTH, TURRET_PIVOT } from '../sim/tank';
import { drawPixelLine, fillPixelCircle } from './pixels';
import { lighten, PLAYER_COLORS, SPRITE_HEIGHT, tankSprite } from './tank-sprite';

const FIRE_COLORS = ['#ffffff', '#fff27a', '#ffc23a', '#ff7a1a', '#e0321e', '#9a1a14'];
const ARROWS = { left: '←', right: '→', up: '↑' } as const;

interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  age: number;
}

/**
 * Draws everything on the battlefield except terrain and sky: tanks, shots, explosions,
 * floating damage numbers, and the (placeholder) HUD.
 */
export class BattleRenderer {
  private floaters: Floater[] = [];

  /** Feed sim events to spawn presentation-only effects. */
  onEvents(round: Round, events: readonly RoundEvent[]): void {
    for (const e of events) {
      if (e.type === 'tankHit') {
        const t = round.tanks[e.tankId]!;
        this.floaters.push({
          x: t.x,
          y: t.y - 12,
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
  ): void {
    for (const t of round.tanks) {
      if (!t.alive) continue;
      const x = Math.round(t.x);
      const y = Math.round(t.y);
      const color = PLAYER_COLORS[t.color]!;
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

    // Marker above the tank whose turn it is.
    const cur = round.current;
    if (cur?.alive && round.phase === 'aiming') {
      const bob = Math.floor(round.tickCount / 15) % 2;
      ctx.fillStyle = PLAYER_COLORS[cur.color]!;
      const mx = Math.round(cur.x);
      const my = Math.round(cur.y) - 24 - bob;
      ctx.fillRect(mx - 3, my, 7, 1);
      ctx.fillRect(mx - 2, my + 1, 5, 1);
      ctx.fillRect(mx - 1, my + 2, 3, 1);
      ctx.fillRect(mx, my + 3, 1, 1);
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

    for (const e of round.explosions) {
      const grow = Math.min(1, (e.age + alpha) / 6);
      const fade = Math.max(0, (e.age - (EXPLOSION_TICKS - 10)) / 10);
      const r = e.radius * grow * (1 - fade * 0.6);
      const ci = Math.min(FIRE_COLORS.length - 1, Math.floor((e.age / EXPLOSION_TICKS) * 6));
      ctx.fillStyle = FIRE_COLORS[Math.min(FIRE_COLORS.length - 1, ci + 1)]!;
      fillPixelCircle(ctx, e.x, e.y, r);
      ctx.fillStyle = FIRE_COLORS[ci]!;
      fillPixelCircle(ctx, e.x, e.y, r * 0.6);
    }

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const f of this.floaters) {
      ctx.fillStyle = '#000';
      ctx.fillText(f.text, Math.round(f.x) + 1, Math.round(f.y - f.age / 3) + 1);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, Math.round(f.x), Math.round(f.y - f.age / 3));
    }
    ctx.textAlign = 'start';
  }

  /**
   * "Tracking bars": when the shell is above or beside the field, a marker on that edge shows
   * where it is, with a bar whose length grows with its distance from the field.
   */
  private drawTracking(ctx: CanvasRenderingContext2D, px: number, py: number, width: number) {
    const color = '#ffe9a0';
    ctx.fillStyle = color;
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

  /** Temporary HUD until Stage 4's full panel and equipment strip. */
  drawHud(ctx: CanvasRenderingContext2D, round: Round): void {
    const { hud } = LAYOUT;
    ctx.fillStyle = '#1a1424';
    ctx.fillRect(hud.x, hud.y, hud.w, hud.h);
    ctx.font = 'bold 15px monospace';
    ctx.textBaseline = 'top';

    const t = round.current;
    const label = (text: string, value: string, x: number, y: number, color = '#ffe74a') => {
      ctx.fillStyle = '#b58cff';
      ctx.fillText(text, x, y);
      ctx.fillStyle = color;
      ctx.fillText(value, x + ctx.measureText(text).width, y);
    };

    const windDir = round.wind === 0 ? '' : round.wind > 0 ? ' →' : ' ←';
    label('Wind: ', `${Math.abs(round.wind)}${windDir}`, 250, 34, '#7fb4ff');
    ctx.font = '10px monospace';
    ctx.fillStyle = '#5c5378';
    ctx.fillText(round.windLevel, 250, 52);
    ctx.font = 'bold 15px monospace';

    // The original's magenta "R": walls rebound this round.
    if (round.walls) {
      ctx.fillStyle = '#e040ff';
      ctx.fillRect(480, 32, 18, 18);
      ctx.fillStyle = '#1a1424';
      ctx.fillText('R', 485, 34);
    }

    if (t?.alive && round.phase !== 'dropping' && round.phase !== 'roundOver') {
      const { degrees, facing } = displayAngle(t.angle);
      label('Angle: ', `${degrees} ${ARROWS[facing]}`, 12, 10);
      label('Power: ', `${Math.round(t.power)}`, 12, 34);
      ctx.fillStyle = PLAYER_COLORS[t.color]!;
      ctx.fillText(t.name, 250, 10);
      label('Men: ', `${t.health}`, 480, 10);
    } else {
      ctx.fillStyle = '#8a7fa8';
      ctx.fillText(round.phase === 'roundOver' ? 'Round over' : 'Get ready…', 12, 10);
    }
    ctx.fillStyle = '#5c5378';
    ctx.font = '9px monospace';
    ctx.textAlign = 'right';
    ctx.fillText('←/→ angle ↑/↓ power PgUp/PgDn ±100 I flip Space fire  F2 options', hud.w - 8, 53);
    ctx.textAlign = 'start';
  }

  drawRoundOver(ctx: CanvasRenderingContext2D, round: Round): void {
    if (round.phase !== 'roundOver') return;
    const { field } = LAYOUT;
    const winner = round.winnerId === null ? null : round.tanks[round.winnerId]!;
    const cx = field.x + field.w / 2;
    const cy = field.y + field.h / 2;
    ctx.fillStyle = 'rgb(0 0 0 / 65%)';
    ctx.fillRect(cx - 160, cy - 34, 320, 68);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = winner ? PLAYER_COLORS[winner.color]! : '#ffffff';
    ctx.fillText(winner ? `${winner.name} wins!` : 'Nobody survived!', cx, cy - 10);
    ctx.font = '12px monospace';
    ctx.fillStyle = '#cccccc';
    ctx.fillText('Press Space or Enter for a new round', cx, cy + 16);
    ctx.textAlign = 'start';
  }
}
