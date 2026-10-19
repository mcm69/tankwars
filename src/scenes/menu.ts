import { AI_NAMES } from '../ai/registry';
import type { App } from '../app';
import { LOGICAL_WIDTH } from '../config';
import { UiInput, type UiEvent } from '../input/ui-input';
import { drawText } from '../render/font';
import { backdrop, heading, MenuList, UI, type MenuItem } from '../ui/widgets';
import { optionItems } from './menu-items';
import type { Scene } from './scene';

const ROW_H = 26;
const LIST_TOP = 150;
/** Heading block (title and hint), centered above the list. */
const HEADING_Y = 70;

/**
 * The main menu: just what you need to start playing (players, set length, wind), with
 * everything else on the Options screen.
 */
export class MenuScene implements Scene {
  readonly name = 'menu';
  private readonly input: UiInput;
  private readonly list: MenuList;

  constructor(
    private readonly app: App,
    private readonly message: string | null = null,
    /** Row to put the cursor on (e.g. 'options' when coming back from there). */
    focus?: string,
  ) {
    this.input = new UiInput(app.screen);
    const o = optionItems(app);
    const items: MenuItem[] = [
      {
        id: 'start',
        label: 'Start',
        activate: () => app.showSetup(),
        help: `Pick players and opponents: ${AI_NAMES.lobber}, ${AI_NAMES.twanger} and more.`,
      },
      o.players,
      o.gamesPerSet,
      o.wind,
      {
        id: 'options',
        label: 'Options',
        activate: () => app.showOptions(),
        help: 'Terrain and weapon rules, sound, backgrounds and motion.',
      },
    ];
    const saved = app.savedSet;
    if (saved) {
      items.unshift({
        id: 'resume',
        label: `Resume game ${saved.roundsPlayed + 1} of ${saved.settings.gamesPerSet}`,
        activate: () => app.resumeSet(),
        help: `Carry on the unfinished set (${saved.players.map((p) => p.name).join(', ')}).`,
      });
    }
    this.list = new MenuList(items, 160, LIST_TOP, 320, ROW_H);
    if (focus) this.list.select(focus);
  }

  update(): void {
    for (const e of this.input.poll()) {
      const before = this.list.selected;
      if (this.list.handle(e)) {
        this.menuSound(e, before);
        continue;
      }
      if (e.type === 'key' && e.code === 'Escape') {
        this.app.audio.ui('back');
        this.app.showTitle();
      }
      if (e.type === 'key' && e.code === 'KeyS' && !e.repeat) this.app.showSetup();
      if (e.type === 'key' && e.code === 'KeyO' && !e.repeat) this.app.showOptions();
    }
  }

  private menuSound(e: UiEvent, selectedBefore: number): void {
    if (e.type === 'move') return;
    const item = this.list.items[this.list.selected];
    if (e.type === 'key' && this.list.selected !== selectedBefore) this.app.audio.ui('move');
    else this.app.audio.ui(item?.activate ? 'select' : 'change');
  }

  render(): void {
    const { ctx } = this.app.screen;
    backdrop(ctx);
    heading(ctx, 'TANK WARS', HEADING_Y);
    if (this.message)
      drawText(ctx, this.message, LOGICAL_WIDTH / 2, HEADING_Y + 34, UI.accent, 1, 'center');
    else {
      const hint = this.app.screen.touch
        ? 'Tap ◀ ▶ (or the value) to change'
        : '↑↓ choose   ←→ or click to change   Enter to select';
      drawText(ctx, hint, LOGICAL_WIDTH / 2, HEADING_Y + 34, UI.dim, 1, 'center');
    }
    this.list.draw(ctx);
  }

  dispose(): void {
    this.input.dispose();
  }
}
