import type { Rect } from '../config';
import { LAYOUT } from '../config';
import { GUIDANCE_H, GUIDANCE_V, itemIndex, ITEMS, STRIP_ITEMS } from '../sim/items';
import type { Round } from '../sim/round';
import { displayAngle, type Tank } from '../sim/tank';
import { compactCount, drawMicro, drawText, textWidth } from './font';
import {
  BADGE_RECT,
  HUD_RECTS,
  MEN_X,
  NAME_X,
  ROW_A,
  ROW_B,
  slotRect,
  VALUE_RIGHT,
  WEAPON_LABEL_X,
  type HudId,
} from './hud-layout';
import { ICON_SIZE, itemIcon } from './icons';
import { PLAYER_COLORS } from './tank-sprite';

const BG = '#1a1424';
const LABEL = '#b58cff';
const VALUE = '#ffe74a';
const WIND = '#7fb4ff';
const DIM = '#5c5378';
const ARROWS = { left: '←', right: '→', up: '↑' } as const;
const SHIELD_ENERGY = itemIndex('shieldEnergy');
const SHIELD_INERTIA = itemIndex('shieldInertia');

export interface HudState {
  soundOn: boolean;
  hover: HudId | null;
  pressed: HudId | null;
}

/** The top panel: aim readouts with click controls, wind, men, equipment strip, buttons. */
export function drawHud(ctx: CanvasRenderingContext2D, round: Round, ui: HudState): void {
  const { hud } = LAYOUT;
  ctx.fillStyle = BG;
  ctx.fillRect(hud.x, hud.y, hud.w, hud.h);

  const t = round.current;
  const active = !!t?.alive && round.phase !== 'dropping' && round.phase !== 'roundOver';
  const aiming = active && round.phase === 'aiming';

  // Row A: angle ◀ value ▶ direction | name | men
  drawText(ctx, 'Angle', 8, ROW_A, LABEL, 2);
  drawText(ctx, 'Power', 8, ROW_B, ui.hover === 'powerLabel' && aiming ? '#e0c8ff' : LABEL, 2);
  if (active && t) {
    const { degrees, facing } = displayAngle(t.angle);
    drawText(ctx, String(degrees), VALUE_RIGHT, ROW_A, VALUE, 2, 'right');
    drawText(ctx, String(Math.round(t.power)), VALUE_RIGHT, ROW_B, VALUE, 2, 'right');
    arrowButton(ctx, HUD_RECTS.angleLeft, '◀', ui, 'angleLeft', aiming);
    arrowButton(ctx, HUD_RECTS.angleRight, '▶', ui, 'angleRight', aiming);
    arrowButton(ctx, HUD_RECTS.powerDown, '◀', ui, 'powerDown', aiming);
    arrowButton(ctx, HUD_RECTS.powerUp, '▶', ui, 'powerUp', aiming);
    arrowButton(ctx, HUD_RECTS.flip, ARROWS[facing], ui, 'flip', aiming);

    drawText(ctx, t.name, NAME_X, ROW_A, PLAYER_COLORS[t.color]!, 2);
    drawText(ctx, 'Men', MEN_X, ROW_A, LABEL, 2);
    drawText(ctx, String(t.health), MEN_X + 44, ROW_A, VALUE, 2);
    drawWeaponLabel(ctx, t);
  } else {
    drawText(ctx, round.phase === 'roundOver' ? 'Round over' : 'Get ready…', NAME_X, ROW_A, DIM, 2);
  }

  // Row B: wind | walls badge
  const windArrow = round.wind === 0 ? '' : round.wind > 0 ? '→' : '←';
  const windText = `${Math.abs(round.wind)}${windArrow}`;
  drawText(ctx, 'Wind', NAME_X, ROW_B, LABEL, 2);
  drawText(ctx, windText, NAME_X + 56, ROW_B, WIND, 2);
  drawText(ctx, round.windLevel, NAME_X + 60 + textWidth(windText, 2), ROW_B + 7, DIM);
  if (round.walls) {
    ctx.fillStyle = '#e040ff';
    ctx.fillRect(BADGE_RECT.x, BADGE_RECT.y, BADGE_RECT.w, BADGE_RECT.h);
    drawText(ctx, 'R', BADGE_RECT.x + 3, BADGE_RECT.y + 1, BG, 2);
  }

  drawFireButton(ctx, ui, aiming);
  drawStrip(ctx, active ? t : undefined, ui, aiming);
}

function drawWeaponLabel(ctx: CanvasRenderingContext2D, t: Tank): void {
  const item = ITEMS[t.selected]!;
  const count = t.inventory[t.selected]!;
  const label = `${item.short} ×${count}`;
  drawText(ctx, label, WEAPON_LABEL_X, ROW_B + 4, '#ff6a6a');
}

function bevel(ctx: CanvasRenderingContext2D, r: Rect, pressed: boolean, fill: string): void {
  ctx.fillStyle = fill;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.fillStyle = pressed ? '#0c0812' : '#5a4e78';
  ctx.fillRect(r.x, r.y, r.w, 1);
  ctx.fillRect(r.x, r.y, 1, r.h);
  ctx.fillStyle = pressed ? '#5a4e78' : '#0c0812';
  ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
  ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
}

function arrowButton(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  glyph: string,
  ui: HudState,
  id: HudId,
  enabled: boolean,
): void {
  const pressed = enabled && ui.pressed === id;
  const hover = enabled && ui.hover === id;
  bevel(ctx, r, pressed, hover ? '#3a2f52' : '#2a2238');
  drawText(
    ctx,
    glyph,
    r.x + r.w / 2,
    r.y + 1 + (pressed ? 1 : 0),
    enabled ? VALUE : DIM,
    2,
    'center',
  );
}

function drawFireButton(ctx: CanvasRenderingContext2D, ui: HudState, enabled: boolean): void {
  const r = HUD_RECTS.fire;
  const pressed = enabled && ui.pressed === 'fire';
  const fill = !enabled ? '#2a2238' : ui.hover === 'fire' ? '#d8343a' : '#b02428';
  bevel(ctx, r, pressed, fill);
  drawText(
    ctx,
    'FIRE',
    r.x + r.w / 2,
    r.y + 10 + (pressed ? 1 : 0),
    enabled ? '#fff' : DIM,
    2,
    'center',
  );
}

function drawStrip(
  ctx: CanvasRenderingContext2D,
  t: Tank | undefined,
  ui: HudState,
  enabled: boolean,
): void {
  for (let i = 0; i < STRIP_ITEMS; i++) {
    const r = slotRect(i);
    const count = t?.inventory[i] ?? 0;
    const owned = count > 0;
    const armed = !!t && i === t.selected && i !== GUIDANCE_H && i !== GUIDANCE_V;
    const hover = enabled && ui.hover === `slot:${i}`;
    ctx.fillStyle = armed ? '#4a1c2a' : owned ? '#2c2440' : '#151020';
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = armed ? '#ff3a3a' : owned ? (hover ? '#ffffff' : '#a8a0c0') : '#2a2238';
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    ctx.drawImage(itemIcon(i, !owned), r.x + (r.w - ICON_SIZE) / 2, r.y + 2);
    if (owned) drawMicro(ctx, compactCount(count), r.x + r.w - 3, r.y + r.h - 7, '#ffffff');
  }

  // Shield indicator: shows whichever shield the tank carries (Stage 7 makes them work).
  const sr = HUD_RECTS.shield;
  const shield = t
    ? [SHIELD_ENERGY, SHIELD_INERTIA].find((s) => (t.inventory[s] ?? 0) > 0)
    : undefined;
  ctx.fillStyle = shield !== undefined ? '#1e3a40' : '#151020';
  ctx.fillRect(sr.x, sr.y, sr.w, sr.h);
  ctx.strokeStyle = shield !== undefined ? '#3fe6e6' : '#2a2238';
  ctx.strokeRect(sr.x + 0.5, sr.y + 0.5, sr.w - 1, sr.h - 1);
  ctx.drawImage(itemIcon(shield ?? SHIELD_ENERGY, shield === undefined), sr.x + 7, sr.y + 2);
  if (shield !== undefined && t) {
    drawMicro(ctx, compactCount(t.inventory[shield]!), sr.x + sr.w - 3, sr.y + sr.h - 7, '#fff');
  }

  smallButton(ctx, HUD_RECTS.help, ui, 'help', (r) =>
    drawText(ctx, '?', r.x + r.w / 2, r.y + 2, VALUE, 2, 'center'),
  );
  smallButton(ctx, HUD_RECTS.pause, ui, 'pause', (r) => {
    ctx.fillStyle = VALUE;
    ctx.fillRect(r.x + 8, r.y + 4, 3, 11);
    ctx.fillRect(r.x + 13, r.y + 4, 3, 11);
  });
  smallButton(ctx, HUD_RECTS.sound, ui, 'sound', (r) => {
    drawText(ctx, 'SND', r.x + r.w / 2, r.y + 6, ui.soundOn ? VALUE : DIM, 1, 'center');
    if (!ui.soundOn) {
      ctx.fillStyle = '#ff3a3a';
      for (let k = 0; k < 15; k++) ctx.fillRect(r.x + 9 + k, r.y + 16 - k, 1, 1);
    }
  });
}

function smallButton(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  ui: HudState,
  id: HudId,
  draw: (r: Rect) => void,
): void {
  bevel(ctx, r, ui.pressed === id, ui.hover === id ? '#3a2f52' : '#2a2238');
  draw(r);
}
