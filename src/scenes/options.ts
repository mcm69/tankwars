import type { App } from '../app';
import { LOGICAL_WIDTH } from '../config';
import { UiInput, type UiEvent } from '../input/ui-input';
import { drawText } from '../render/font';
import { backdrop, heading, MenuList, UI, type MenuItem } from '../ui/widgets';
import { optionItems } from './menu-items';
import type { Scene } from './scene';

const header = (id: string, label: string): MenuItem => ({ id, label, header: true });

/** Everything that isn't needed to start a game: rules, sound and display, in sections. */
export class OptionsScene implements Scene {
  readonly name = 'options';
  private readonly input: UiInput;
  private readonly list: MenuList;
  private notice: string | null = null;

  constructor(private readonly app: App) {
    this.input = new UiInput(app.screen);
    const o = optionItems(app);
    const items: MenuItem[] = [
      header('rules', 'Game rules'),
      o.crumble,
      o.walls,
      o.tanksFall,
      o.explosionsKill,
      o.visibleShot,
      o.shotTrail,
      o.computersBuy,
      header('soundHeader', 'Sound'),
      o.sound,
      o.volume,
      o.flySound,
      header('display', 'Display'),
      o.background,
      o.backgroundSpeed,
      o.motion,
      o.screenShake,
      {
        id: 'defaults',
        label: 'Restore defaults',
        activate: () => {
          app.restoreDefaults();
          this.notice = 'Defaults restored';
        },
        help: 'Puts every option and player back to the original defaults.',
      },
      { id: 'back', label: 'Back', activate: () => this.back(), help: 'Return to the main menu.' },
    ];
    this.list = new MenuList(items, 140, 52, 360, 17);
  }

  private back(): void {
    this.app.audio.ui('back');
    this.app.showMenu(null, 'options');
  }

  update(): void {
    for (const e of this.input.poll()) {
      const before = this.list.selected;
      if (this.list.handle(e)) {
        this.menuSound(e, before);
        continue;
      }
      if (e.type === 'key' && (e.code === 'Escape' || e.code === 'Backspace')) {
        this.back();
        return;
      }
    }
  }

  private menuSound(e: UiEvent, selectedBefore: number): void {
    if (e.type === 'move') return;
    const item = this.list.items[this.list.selected];
    if (e.type === 'key' && this.list.selected !== selectedBefore) this.app.audio.ui('move');
    else if (item?.id !== 'back') this.app.audio.ui(item?.activate ? 'select' : 'change');
  }

  render(): void {
    const { ctx } = this.app.screen;
    backdrop(ctx);
    heading(ctx, 'OPTIONS', 8);
    const hint = this.notice
      ? this.notice
      : this.app.screen.touch
        ? 'Tap ◀ ▶ (or the value) to change'
        : '↑↓ choose   ←→ or click to change   Esc to go back';
    drawText(ctx, hint, LOGICAL_WIDTH / 2, 36, this.notice ? UI.accent : UI.dim, 1, 'center');
    this.list.draw(ctx);
  }

  dispose(): void {
    this.input.dispose();
  }
}
