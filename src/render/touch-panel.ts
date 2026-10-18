import type { Rect } from '../config';
import type { TouchId } from '../input/touch-controls';
import { GUIDANCE_H, GUIDANCE_V, ITEMS } from '../sim/items';
import type { Round } from '../sim/round';
import { displayAngle } from '../sim/tank';
import { compactCount, drawText } from './font';
import { itemIcon } from './icons';
import { PLAYER_COLORS } from './tank-sprite';

const LABEL = '#b58cff';
const VALUE = '#ffe74a';
const DIM = '#5c5378';

function button(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  opts: { pressed: boolean; enabled: boolean; fill?: string; active?: boolean },
): void {
  const fill = !opts.enabled ? '#1a1428' : opts.active ? '#7a1c2a' : (opts.fill ?? '#2a2238');
  ctx.fillStyle = opts.pressed && opts.enabled ? '#4a3f68' : fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = opts.pressed ? '#0c0812' : '#5a4e78';
  ctx.fillRect(r.x, r.y, r.w, 2);
  ctx.fillRect(r.x, r.y, 2, r.h);
  ctx.fillStyle = opts.pressed ? '#5a4e78' : '#0c0812';
  ctx.fillRect(r.x, r.y + r.h - 2, r.w, 2);
  ctx.fillRect(r.x + r.w - 2, r.y, 2, r.h);
}

const center = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

/**
 * Draws the touch layout's side panels: angle/power/flip/pause on the left, weapon carousel,
 * guidance and FIRE on the right, with live values from the current tank.
 */
export function drawTouchPanels(
  ctx: CanvasRenderingContext2D,
  layout: Record<TouchId, Rect>,
  pressed: Set<TouchId>,
  round: Round,
  enabled: boolean,
  sideWidth: number,
  canvasWidth: number,
): void {
  ctx.fillStyle = '#120c1c';
  ctx.fillRect(0, 0, sideWidth, 400);
  ctx.fillRect(canvasWidth - sideWidth, 0, sideWidth, 400);
  const t = round.current;
  const on = enabled && !!t?.alive;
  const b = (id: TouchId, extra: { fill?: string; active?: boolean } = {}) =>
    button(ctx, layout[id], { pressed: pressed.has(id), enabled: on, ...extra });
  const glyph = (id: TouchId, text: string, scale = 3, color = on ? VALUE : DIM) => {
    const c = center(layout[id]);
    drawText(ctx, text, c.x, c.y - (7 * scale) / 2, color, scale, 'center');
  };

  // Left: aim.
  const lx = sideWidth / 2;
  if (t) {
    const { degrees } = displayAngle(t.angle);
    drawText(ctx, `ANGLE ${degrees}`, lx, 70, LABEL, 1, 'center');
    drawText(ctx, `POWER ${Math.round(t.power)}`, lx, 154, LABEL, 1, 'center');
  }
  b('angleLeft');
  glyph('angleLeft', '◀');
  b('angleRight');
  glyph('angleRight', '▶');
  b('powerDown');
  glyph('powerDown', '-');
  b('powerUp');
  glyph('powerUp', '+');
  b('flip');
  glyph('flip', '←→', 2);
  button(ctx, layout.pause, { pressed: pressed.has('pause'), enabled: true });
  const pc = center(layout.pause);
  ctx.fillStyle = VALUE;
  ctx.fillRect(pc.x - 7, pc.y - 9, 5, 18);
  ctx.fillRect(pc.x + 2, pc.y - 9, 5, 18);

  // Right: weapon carousel, guidance, FIRE.
  const rx = canvasWidth - sideWidth / 2;
  b('weaponPrev');
  glyph('weaponPrev', '◀', 2);
  b('weaponNext');
  glyph('weaponNext', '▶', 2);
  if (t) {
    const item = ITEMS[t.selected]!;
    drawText(ctx, item.short, rx, 70, '#ff6a6a', 1, 'center');
    const icon = itemIcon(t.selected);
    ctx.drawImage(icon, rx - 10, 92, 20, 20);
    drawText(ctx, compactCount(t.inventory[t.selected] ?? 0), rx, 120, '#ffffff', 1, 'center');
  }
  for (const [id, item, axis] of [
    ['guidanceH', GUIDANCE_H, 'H'],
    ['guidanceV', GUIDANCE_V, 'V'],
  ] as const) {
    const owned = (t?.inventory[item] ?? 0) > 0;
    button(ctx, layout[id], {
      pressed: pressed.has(id),
      enabled: on && owned,
      active: t?.guidance?.axis === axis,
    });
    glyph(id, axis, 2, on && owned ? '#ffffff' : DIM);
  }
  b('fire', { fill: '#b02428' });
  glyph('fire', 'FIRE', 3, on ? '#ffffff' : DIM);
  if (t) {
    ctx.fillStyle = PLAYER_COLORS[t.color]!;
    ctx.fillRect(layout.fire.x + 6, layout.fire.y + layout.fire.h - 10, layout.fire.w - 12, 4);
  }
}
