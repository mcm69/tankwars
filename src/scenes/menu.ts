import { AI_NAMES } from '../ai/registry';
import type { App } from '../app';
import { LOGICAL_WIDTH } from '../config';
import { UiInput, type UiEvent } from '../input/ui-input';
import { drawText } from '../render/font';
import { BACKGROUND_NAMES, BACKGROUNDS, MAX_PLAYERS, type Settings } from '../game/settings';
import { WIND_LEVELS } from '../sim/options';
import { backdrop, heading, MenuList, UI, type MenuItem } from '../ui/widgets';
import type { Scene } from './scene';

const onOff = (b: boolean) => (b ? 'On' : 'Off');
const yesNo = (b: boolean) => (b ? 'Yes' : 'No');
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

function cycle<T>(list: readonly T[], current: T, dir: 1 | -1): T {
  const i = list.indexOf(current);
  return list[(i + dir + list.length) % list.length]!;
}

const step = (v: number, dir: 1 | -1, lo: number, hi: number, by = 1) =>
  Math.min(hi, Math.max(lo, v + dir * by));

/** The main menu: every game option from the original, then Start. */
export class MenuScene implements Scene {
  readonly name = 'menu';
  private readonly input: UiInput;
  private readonly list: MenuList;

  constructor(
    private readonly app: App,
    private readonly message: string | null = null,
  ) {
    this.input = new UiInput(app.screen);
    const s = (): Settings => app.settings;
    const toggle =
      (
        key: keyof Settings &
          (
            | 'sound'
            | 'flySound'
            | 'visibleShot'
            | 'shotTrail'
            | 'tanksFall'
            | 'explosionsKill'
            | 'computersBuy'
          ),
      ) =>
      () => {
        app.settings = { ...s(), [key]: !s()[key] };
      };
    const items: MenuItem[] = [
      {
        id: 'sound',
        label: 'Sound effects',
        value: () => onOff(s().sound),
        change: toggle('sound'),
        help: 'Turns all sound on or off (also S during play).',
      },
      {
        id: 'volume',
        label: 'Volume',
        value: () => (s().volume === 0 ? 'Silent' : String(s().volume)),
        change: (d) => (app.settings = { ...s(), volume: step(s().volume, d, 0, 10) }),
        help: 'Master volume for all sound effects.',
      },
      {
        id: 'flySound',
        label: 'Fly sound',
        value: () => onOff(s().flySound),
        change: toggle('flySound'),
        help: 'Shells whistle in flight. Gets annoying fast.',
      },
      {
        id: 'crumble',
        label: 'Crumbling hills',
        value: () => `${s().crumble}%`,
        change: (d) => (app.settings = { ...s(), crumble: step(s().crumble, d, 0, 100, 10) }),
        help: 'How often loose ground falls after a shot.',
      },
      {
        id: 'walls',
        label: 'Rebounding walls',
        value: () => ({ off: 'No', on: 'Yes', random: 'Random' })[s().walls],
        change: (d) =>
          (app.settings = { ...s(), walls: cycle(['off', 'random', 'on'] as const, s().walls, d) }),
        help: 'Shots bounce off the sides and ceiling. Random decides each game.',
      },
      {
        id: 'wind',
        label: 'Wind',
        value: () => cap(s().wind),
        change: (d) =>
          (app.settings = {
            ...s(),
            wind: cycle([...WIND_LEVELS, 'random'] as const, s().wind, d),
          }),
        help: 'From none to gale. Gales can exceed ten thousand.',
      },
      {
        id: 'visibleShot',
        label: 'Visible shot',
        value: () => yesNo(s().visibleShot),
        change: toggle('visibleShot'),
        help: 'When off, shells are invisible in flight.',
      },
      {
        id: 'shotTrail',
        label: 'Shot trace',
        value: () => yesNo(s().shotTrail),
        change: toggle('shotTrail'),
        help: 'Shells leave a trail for the rest of the game.',
      },
      {
        id: 'background',
        label: 'Background',
        value: () => BACKGROUND_NAMES[s().background],
        change: (d) =>
          (app.settings = { ...s(), background: cycle(BACKGROUNDS, s().background, d) }),
        help: 'Animated skies (coming in a later stage).',
      },
      {
        id: 'backgroundSpeed',
        label: 'Background speed',
        value: () => (s().backgroundSpeed === 0 ? 'Still' : String(s().backgroundSpeed)),
        change: (d) =>
          (app.settings = { ...s(), backgroundSpeed: step(s().backgroundSpeed, d, 0, 10) }),
        help: 'How fast the background animates.',
      },
      {
        id: 'gamesPerSet',
        label: 'Games per set',
        value: () => String(s().gamesPerSet),
        change: (d) => (app.settings = { ...s(), gamesPerSet: step(s().gamesPerSet, d, 1, 99) }),
        help: 'Rounds in a set. Long sets reward saving up for big weapons.',
      },
      {
        id: 'tanksFall',
        label: 'Tanks fall down',
        value: () => yesNo(s().tanksFall),
        change: toggle('tanksFall'),
        help: 'Tanks fall (and get hurt) when ground is blown away.',
      },
      {
        id: 'players',
        label: 'Number of players',
        value: () => String(s().players),
        change: (d) => (app.settings = { ...s(), players: step(s().players, d, 2, MAX_PLAYERS) }),
        help: 'Two to ten tanks, humans and computers.',
      },
      {
        id: 'explosionsKill',
        label: 'Explosions kill',
        value: () => yesNo(s().explosionsKill),
        change: toggle('explosionsKill'),
        help: 'Flying debris from destroyed tanks can hurt you.',
      },
      {
        id: 'computersBuy',
        label: 'Computers can buy',
        value: () => yesNo(s().computersBuy),
        change: toggle('computersBuy'),
        help: 'Computer players may buy weapons between games.',
      },
      {
        id: 'start',
        label: 'Start',
        activate: () => app.showSetup(),
        help: `Opponents include ${AI_NAMES.lobber}, ${AI_NAMES.twanger} and more.`,
      },
    ];
    this.list = new MenuList(items, 140, 44, 360, 20);
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
    heading(ctx, 'TANK WARS', 5);
    if (this.message) drawText(ctx, this.message, LOGICAL_WIDTH / 2, 34, UI.accent, 1, 'center');
    else {
      const hint = this.app.screen.touch
        ? 'Tap ◀ ▶ (or the value) to change, tap Start to play'
        : '↑↓ choose   ←→ or click to change   Enter on Start (or S)';
      drawText(ctx, hint, LOGICAL_WIDTH / 2, 34, UI.dim, 1, 'center');
    }
    this.list.draw(ctx);
  }

  dispose(): void {
    this.input.dispose();
  }
}
