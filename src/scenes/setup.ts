import { AI_BLURBS, AI_IDS, AI_NAMES, type AiId } from '../ai/registry';
import type { App } from '../app';
import type { Rect } from '../config';
import { LOGICAL_WIDTH } from '../config';
import { UiInput, type UiEvent } from '../input/ui-input';
import { drawText } from '../render/font';
import { PLAYER_COLORS, tankSprite } from '../render/tank-sprite';
import { MAX_NAME_LENGTH, type PlayerSlot } from '../game/settings';
import { TextEntry } from '../ui/text-entry';
import { backdrop, button, heading, inside, UI } from '../ui/widgets';
import type { Scene } from './scene';

const TOP = 52;
const ROW_H = 27;
const NAME_RECT = (i: number): Rect => ({ x: 60, y: TOP + i * ROW_H, w: 170, h: 22 });
const TYPE_RECT = (i: number): Rect => ({ x: 240, y: TOP + i * ROW_H, w: 90, h: 22 });
const AI_RECT = (i: number): Rect => ({ x: 340, y: TOP + i * ROW_H, w: 200, h: 22 });
const BACK_RECT: Rect = { x: 150, y: 352, w: 140, h: 26 };
const START_RECT: Rect = { x: 350, y: 352, w: 140, h: 26 };

const isDefaultName = (name: string, index: number) =>
  name === `Player ${index + 1}` || Object.values(AI_NAMES).includes(name) || name.trim() === '';

/**
 * Who plays: for each slot, a name, Human or Computer, and the computer's personality.
 * Keys: ↑↓ row · Enter/Space edit name · H human · C computer · ←→ personality · S start ·
 * Esc back. Everything is clickable too.
 */
export class SetupScene implements Scene {
  readonly name = 'setup';
  private readonly input: UiInput;
  private readonly entry = new TextEntry();
  private selected = 0;
  private editing = -1;
  private ticks = 0;

  constructor(private readonly app: App) {
    this.input = new UiInput(app.screen);
  }

  private get count(): number {
    return this.app.settings.players;
  }

  private slot(i: number): PlayerSlot {
    return this.app.slots[i]!;
  }

  private setKind(i: number, kind: PlayerSlot['kind']): void {
    const s = this.slot(i);
    if (s.kind === kind) return;
    const rename = isDefaultName(s.name, i);
    s.kind = kind;
    if (rename) s.name = kind === 'computer' ? AI_NAMES[s.ai] : `Player ${i + 1}`;
  }

  private cycleAi(i: number, dir: 1 | -1): void {
    const s = this.slot(i);
    if (s.kind !== 'computer') this.setKind(i, 'computer');
    const rename = isDefaultName(s.name, i);
    const idx = AI_IDS.indexOf(s.ai);
    s.ai = AI_IDS[(idx + dir + AI_IDS.length) % AI_IDS.length] as AiId;
    if (rename) s.name = AI_NAMES[s.ai];
  }

  private editName(i: number): void {
    this.selected = i;
    this.editing = i;
    this.entry.start(this.slot(i).name, MAX_NAME_LENGTH, (value) => {
      if (value !== null && value.trim()) this.slot(i).name = value.trim();
      this.editing = -1;
    });
  }

  update(): void {
    this.ticks++;
    for (const e of this.input.poll()) {
      if (!this.entry.active) this.uiSound(e);
      if (this.entry.active) {
        // Keys that beat the field's focus go into it; clicking elsewhere commits (via blur).
        if (e.type === 'key') this.entry.feed(e.key);
        continue;
      }
      if (e.type === 'key') {
        if (e.repeat && !e.code.startsWith('Arrow')) continue;
        switch (e.code) {
          case 'ArrowUp':
            this.selected = (this.selected + this.count - 1) % this.count;
            break;
          case 'ArrowDown':
            this.selected = (this.selected + 1) % this.count;
            break;
          case 'ArrowLeft':
            this.cycleAi(this.selected, -1);
            break;
          case 'ArrowRight':
            this.cycleAi(this.selected, 1);
            break;
          case 'Enter':
          case 'Space':
            this.editName(this.selected);
            break;
          case 'KeyH':
          case 'KeyK':
          case 'KeyM':
            this.setKind(this.selected, 'human');
            break;
          case 'KeyC':
            this.setKind(this.selected, 'computer');
            break;
          case 'KeyS':
            this.app.startSet();
            return;
          case 'Escape':
            this.app.showMenu();
            return;
        }
      } else if (e.type === 'click') {
        if (inside(START_RECT, e.x, e.y)) {
          this.app.startSet();
          return;
        }
        if (inside(BACK_RECT, e.x, e.y)) {
          this.app.showMenu();
          return;
        }
        for (let i = 0; i < this.count; i++) {
          if (inside(NAME_RECT(i), e.x, e.y)) this.editName(i);
          else if (inside(TYPE_RECT(i), e.x, e.y)) {
            this.selected = i;
            this.setKind(i, this.slot(i).kind === 'human' ? 'computer' : 'human');
          } else if (inside(AI_RECT(i), e.x, e.y)) {
            this.selected = i;
            const r = AI_RECT(i);
            this.cycleAi(i, e.button === 2 || e.x < r.x + 20 ? -1 : 1);
          }
        }
      } else if (e.type === 'wheel') {
        for (let i = 0; i < this.count; i++) {
          if (inside(AI_RECT(i), e.x, e.y)) this.cycleAi(i, e.dir);
        }
      }
    }
  }

  /** Clicks and key presses get a little blip; starting and leaving get their own. */
  private uiSound(e: UiEvent): void {
    const audio = this.app.audio;
    if (e.type === 'key' && !e.repeat) {
      if (e.code === 'KeyS') audio.ui('select');
      else if (e.code === 'Escape') audio.ui('back');
      else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') audio.ui('move');
      else if (/^(Arrow|Key[HKMC]|Enter|Space)/.test(e.code)) audio.ui('change');
    } else if (e.type === 'click') {
      audio.ui(inside(START_RECT, e.x, e.y) ? 'select' : 'change');
    }
  }

  render(): void {
    const { ctx } = this.app.screen;
    backdrop(ctx);
    heading(ctx, 'PLAYERS', 10);
    const hover = this.input.pointer;
    for (let i = 0; i < this.count; i++) {
      const s = this.slot(i);
      const y = TOP + i * ROW_H;
      if (i === this.selected) {
        ctx.fillStyle = '#2a1840';
        ctx.fillRect(28, y - 2, 524, ROW_H - 1);
        drawText(ctx, '*', 32, y + 7, UI.accent);
      }
      const color = PLAYER_COLORS[i]!;
      ctx.drawImage(tankSprite(color), 40, y + 9);

      const nr = NAME_RECT(i);
      ctx.fillStyle = '#0c0818';
      ctx.fillRect(nr.x, nr.y, nr.w, nr.h);
      ctx.strokeStyle = this.editing === i ? '#ffffff' : '#3a2f52';
      ctx.strokeRect(nr.x + 0.5, nr.y + 0.5, nr.w - 1, nr.h - 1);
      const name = this.editing === i ? this.entry.value : s.name;
      const caret = this.editing === i && Math.floor(this.ticks / 20) % 2 === 0 ? '_' : '';
      drawText(ctx, name + caret, nr.x + 6, nr.y + 4, color, 2);

      const tr = TYPE_RECT(i);
      button(ctx, tr, s.kind === 'human' ? 'Human' : 'CPU', {
        hover: !!hover && inside(tr, hover.x, hover.y),
        primary: s.kind === 'computer',
      });

      const ar = AI_RECT(i);
      if (s.kind === 'computer') {
        drawText(ctx, '◀', ar.x + 4, ar.y + 8, UI.value);
        drawText(ctx, '▶', ar.x + ar.w - 10, ar.y + 8, UI.value);
        drawText(ctx, AI_NAMES[s.ai], ar.x + ar.w / 2, ar.y + 4, UI.value, 2, 'center');
      } else {
        drawText(ctx, 'keyboard / mouse', ar.x + ar.w / 2, ar.y + 8, UI.dim, 1, 'center');
      }
    }
    const sel = this.slot(this.selected);
    const blurb =
      sel.kind === 'computer' ? `${AI_NAMES[sel.ai]}: ${AI_BLURBS[sel.ai]}` : 'Human player';
    drawText(ctx, blurb, LOGICAL_WIDTH / 2, 334, UI.text, 1, 'center');
    button(ctx, BACK_RECT, 'Back', { hover: !!hover && inside(BACK_RECT, hover.x, hover.y) });
    button(ctx, START_RECT, 'Start', {
      primary: true,
      hover: !!hover && inside(START_RECT, hover.x, hover.y),
    });
    drawText(
      ctx,
      '↑↓ row  Enter name  H human  C computer  ←→ personality  S start  Esc back',
      LOGICAL_WIDTH / 2,
      386,
      UI.dim,
      1,
      'center',
    );
  }

  dispose(): void {
    this.input.dispose();
    this.entry.dispose();
  }
}
