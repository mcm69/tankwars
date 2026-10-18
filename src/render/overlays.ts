import type { Rect } from '../config';
import { LAYOUT } from '../config';
import { ITEMS } from '../sim/items';
import type { Round } from '../sim/round';
import { displayAngle, maxPower } from '../sim/tank';
import { drawText, drawTextShadow } from './font';
import { ICON_SIZE, itemIcon } from './icons';
import { PLAYER_COLORS } from './tank-sprite';

export type Overlay =
  | { kind: 'pause' }
  | { kind: 'help' }
  | { kind: 'status'; tankId: number }
  | { kind: 'confirm'; what: 'massKill' | 'quit' }
  /** Choosing a guidance target: candidate tank ids, left to right. */
  | { kind: 'target'; axis: 'H' | 'V'; candidates: number[]; index: number };

export interface OverlayContext {
  round: Round;
  roundNumber: number;
  totalRounds: number;
  soundOn: boolean;
  tickCount: number;
  /** Touch layout: help shows touch controls instead of mouse ones. */
  touch: boolean;
}

export interface Toast {
  text: string;
  color: string;
  ticks: number;
}

const PANEL_BG = '#120c1c';
const BORDER = '#c050ff';
const LABEL = '#b58cff';
const VALUE = '#ffe74a';
const TEXT = '#d8d0e8';
const DIM = '#7a6f98';
const ARROWS = { left: '←', right: '→', up: '↑' } as const;

function panel(ctx: CanvasRenderingContext2D, w: number, h: number, title: string): Rect {
  const { field } = LAYOUT;
  const r = {
    x: Math.round(field.x + (field.w - w) / 2),
    y: Math.round(field.y + (field.h - h) / 2),
    w,
    h,
  };
  ctx.fillStyle = 'rgb(0 0 0 / 55%)';
  ctx.fillRect(field.x, field.y, field.w, field.h);
  ctx.fillStyle = PANEL_BG;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  ctx.fillStyle = '#2a1840';
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 20);
  drawText(ctx, title, r.x + r.w / 2, r.y + 4, '#ffffff', 2, 'center');
  return r;
}

function footer(ctx: CanvasRenderingContext2D, r: Rect, text: string): void {
  drawText(ctx, text, r.x + r.w / 2, r.y + r.h - 12, DIM, 1, 'center');
}

function rows(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  pairs: readonly (readonly [string, string])[],
  labelW: number,
): void {
  pairs.forEach(([k, v], i) => {
    drawText(ctx, k, x, y + i * 12, LABEL);
    drawText(ctx, v, x + labelW, y + i * 12, VALUE);
  });
}

const yesNo = (b: boolean) => (b ? 'yes' : 'no');

/** The Yes/No buttons of the confirm dialog (for both drawing and hit testing). */
export function confirmButtons(): { yes: Rect; no: Rect } {
  const { field } = LAYOUT;
  const cx = field.x + field.w / 2;
  const y = field.y + field.h / 2 + 18;
  return {
    yes: { x: cx - 80, y, w: 70, h: 20 },
    no: { x: cx + 10, y, w: 70, h: 20 },
  };
}

const PAUSE_W = 340;
const PAUSE_H = 206;

export type PauseAction = 'resume' | 'help' | 'massKill' | 'quit';
const PAUSE_ACTIONS: readonly [PauseAction, string][] = [
  ['resume', 'Resume'],
  ['help', 'Controls'],
  ['massKill', 'Mass kill'],
  ['quit', 'Quit'],
];

/** The Game Status panel's buttons (so touch players can reach every command). */
export function pauseButtons(): Record<PauseAction, Rect> {
  const { field } = LAYOUT;
  const left = Math.round(field.x + (field.w - PAUSE_W) / 2) + 10;
  const y = Math.round(field.y + (field.h - PAUSE_H) / 2) + PAUSE_H - 46;
  const w = (PAUSE_W - 20 - 3 * 6) / 4;
  const out = {} as Record<PauseAction, Rect>;
  PAUSE_ACTIONS.forEach(
    ([id], i) => (out[id] = { x: Math.round(left + i * (w + 6)), y, w: Math.floor(w), h: 24 }),
  );
  return out;
}

export function overlayHitTest(
  o: Overlay,
  x: number,
  y: number,
): 'yes' | 'no' | PauseAction | null {
  const inside = (r: Rect) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  if (o.kind === 'pause') {
    const hit = Object.entries(pauseButtons()).find(([, r]) => inside(r));
    return (hit?.[0] as PauseAction | undefined) ?? null;
  }
  if (o.kind !== 'confirm') return null;
  const { yes, no } = confirmButtons();
  return inside(yes) ? 'yes' : inside(no) ? 'no' : null;
}

export function drawOverlay(ctx: CanvasRenderingContext2D, o: Overlay, c: OverlayContext): void {
  switch (o.kind) {
    case 'pause':
      return drawPause(ctx, c);
    case 'help':
      return drawHelp(ctx, c.touch);
    case 'status':
      return drawStatus(ctx, c.round, o.tankId);
    case 'confirm':
      return drawConfirm(ctx, o.what);
    case 'target':
      return drawTargetPicker(ctx, c.round, o, c.tickCount);
  }
}

function drawTargetPicker(
  ctx: CanvasRenderingContext2D,
  round: Round,
  o: Extract<Overlay, { kind: 'target' }>,
  tickCount: number,
): void {
  const { field } = LAYOUT;
  const name = o.axis === 'H' ? "Herb's guidance" : "Vick's guidance";
  ctx.fillStyle = 'rgb(0 0 0 / 60%)';
  ctx.fillRect(field.x, field.y, field.w, 22);
  drawText(
    ctx,
    `${name}: choose a target   ←→ cycle   Enter confirm   Esc cancel`,
    field.x + field.w / 2,
    field.y + 8,
    '#ffffff',
    1,
    'center',
  );
  const t = round.tanks[o.candidates[o.index]!];
  if (!t) return;
  const x = Math.round(field.x + t.x);
  const y = Math.round(field.y + t.y - 4);
  const r = 12 + (Math.floor(tickCount / 8) % 2) * 2;
  ctx.fillStyle = '#ff3a3a';
  ctx.fillRect(x - r, y, 6, 1);
  ctx.fillRect(x + r - 5, y, 6, 1);
  ctx.fillRect(x, y - r, 1, 6);
  ctx.fillRect(x, y + r - 5, 1, 6);
  drawTextShadow(ctx, t.name, x, y - r - 12, PLAYER_COLORS[t.color]!, 1, 'center');
}

function drawPause(
  ctx: CanvasRenderingContext2D,
  { round, roundNumber, totalRounds, soundOn }: OverlayContext,
) {
  const r = panel(ctx, PAUSE_W, PAUSE_H, 'Game Status');
  const o = round.options;
  const wind = `${o.wind === 'random' ? `random (${round.windLevel})` : o.wind}, now ${Math.abs(round.wind)}${round.wind > 0 ? '→' : round.wind < 0 ? '←' : ''}`;
  rows(
    ctx,
    r.x + 20,
    r.y + 32,
    [
      ['Game', `${roundNumber} of ${totalRounds} (${round.terrainStyle} terrain)`],
      ['Sound', soundOn ? 'on' : 'off'],
      ['Ground crumbles', `${o.crumble}%`],
      ['Walls', `${o.walls}, bounce this round: ${yesNo(round.walls)}`],
      ['Wind', wind],
      ['Shot visible', yesNo(o.visibleShot)],
      ['Shot trail', yesNo(o.shotTrail)],
      ['Tanks fall', yesNo(o.tanksFall)],
      ['Explosions kill', yesNo(o.explosionsKill)],
      ['Mass kill pending', yesNo(round.massKillPending)],
    ],
    110,
  );
  const buttons = pauseButtons();
  for (const [id, label] of PAUSE_ACTIONS) {
    const b = buttons[id];
    ctx.fillStyle = id === 'resume' ? '#2a6a3a' : id === 'help' ? '#3a2f52' : '#7a1c2a';
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    drawText(ctx, label, b.x + b.w / 2, b.y + 8, '#ffffff', 1, 'center');
  }
  footer(ctx, r, 'Paused. Press any key or tap outside the buttons to continue.');
}

const HELP_KEYS: readonly (readonly [string, string])[] = [
  ['← →', 'tilt barrel (hold = fast)'],
  ['↑ ↓', 'power ±1 (hold = fast)'],
  ['PgUp PgDn', 'power ±100'],
  ['Shift + key', 'single steps, no repeat'],
  ['I', 'flip direction'],
  ['Space Enter', 'fire'],
  ['Tab Shift+Tab', 'next / previous weapon'],
  ['H  V', 'guidance systems'],
  ['1-9, 0', 'player status'],
  ['Esc  P', 'pause and game status'],
  ['S', 'sound on/off'],
  ['K', 'mass kill (asks first)'],
  ['Q', 'quit game (asks first)'],
];

const HELP_TOUCH: readonly string[] = [
  'Drag on the field to aim: direction',
  'from your turret, distance = power.',
  'Side buttons: ◀ ▶ angle, - + power',
  '(hold repeats), weapon ◀ ▶, H V, FIRE.',
  'Tap a tank for its status.',
  'Pause (||) has Mass kill and Quit.',
];

const HELP_MOUSE: readonly string[] = [
  'Drag on the field to aim: direction',
  'from your turret, distance = power.',
  'Click ◀ ▶ to nudge (hold repeats).',
  'Click "Power" for +100 (right: -100).',
  'Click a weapon to arm it; wheel = power.',
  'Click any tank for its status.',
];

function drawHelp(ctx: CanvasRenderingContext2D, touch: boolean): void {
  const r = panel(ctx, 580, 210, 'Controls');
  rows(ctx, r.x + 16, r.y + 30, HELP_KEYS, 90);
  drawText(ctx, touch ? 'Touch' : 'Mouse', r.x + 334, r.y + 30, LABEL);
  (touch ? HELP_TOUCH : HELP_MOUSE).forEach((line, i) =>
    drawText(ctx, line, r.x + 334, r.y + 44 + i * 12, TEXT),
  );
  footer(ctx, r, 'Press any key or click to close.');
}

function drawStatus(ctx: CanvasRenderingContext2D, round: Round, tankId: number): void {
  const t = round.tanks[tankId];
  if (!t) return;
  const r = panel(ctx, 360, 150, `Player ${tankId + 1} status`);
  const color = PLAYER_COLORS[t.color]!;
  drawTextShadow(ctx, t.name, r.x + 16, r.y + 30, color, 2);
  drawText(
    ctx,
    t.alive ? 'alive' : 'destroyed',
    r.x + r.w - 16,
    r.y + 34,
    t.alive ? '#7dff9a' : '#ff6a6a',
    1,
    'right',
  );
  const { degrees, facing } = displayAngle(t.angle);
  rows(
    ctx,
    r.x + 16,
    r.y + 52,
    [
      ['Men', `${t.health}  (max power ${maxPower(t)})`],
      ['Aim', `${degrees} ${ARROWS[facing]}  power ${Math.round(t.power)}`],
      ['Armed', ITEMS[t.selected]!.name],
    ],
    50,
  );
  drawText(ctx, 'Equipment', r.x + 16, r.y + 92, LABEL);
  const owned = ITEMS.map((_, i) => i).filter((i) => (t.inventory[i] ?? 0) > 0);
  owned.forEach((i, k) => {
    const col = k % 4;
    const row = Math.floor(k / 4);
    const x = r.x + 16 + col * 84;
    const y = r.y + 106 + row * 14;
    ctx.drawImage(itemIcon(i), x, y - 2);
    drawText(ctx, `${t.inventory[i]}`, x + ICON_SIZE + 4, y, TEXT);
  });
  if (owned.length === 0) drawText(ctx, 'nothing', r.x + 16, r.y + 106, DIM);
  footer(ctx, r, 'Press any key or click to close.');
}

function drawConfirm(ctx: CanvasRenderingContext2D, what: 'massKill' | 'quit'): void {
  const title = what === 'massKill' ? '! MASS KILL !' : 'Quit Game';
  const r = panel(ctx, 320, 110, title);
  const msg =
    what === 'massKill'
      ? 'Everyone dies after the current turn.'
      : 'Abort this game and start a new one?';
  drawText(ctx, msg, r.x + r.w / 2, r.y + 34, TEXT, 1, 'center');
  drawText(ctx, 'Are you sure? (Y/N)', r.x + r.w / 2, r.y + 48, VALUE, 1, 'center');
  const { yes, no } = confirmButtons();
  for (const [rect, label, fill] of [
    [yes, 'Yes', '#b02428'],
    [no, 'No', '#3a2f52'],
  ] as const) {
    ctx.fillStyle = fill;
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.strokeStyle = '#ffffff';
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    drawText(ctx, label, rect.x + rect.w / 2, rect.y + 3, '#ffffff', 2, 'center');
  }
}

/** Transient messages along the top of the field, newest at the bottom. */
export function drawToasts(ctx: CanvasRenderingContext2D, toasts: readonly Toast[]): void {
  const { field } = LAYOUT;
  toasts.forEach((t, i) => {
    const y = field.y + 8 + i * 16;
    const cx = field.x + field.w / 2;
    drawTextShadow(ctx, t.text, cx, y, t.color, 2, 'center');
  });
}
