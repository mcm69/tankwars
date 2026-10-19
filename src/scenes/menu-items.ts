import type { App } from '../app';
import { BACKGROUND_NAMES, BACKGROUNDS, MAX_PLAYERS, type Settings } from '../game/settings';
import { systemPrefersReducedMotion } from '../render/motion';
import { WIND_LEVELS } from '../sim/options';
import type { MenuItem } from '../ui/widgets';

const onOff = (b: boolean) => (b ? 'On' : 'Off');
const yesNo = (b: boolean) => (b ? 'Yes' : 'No');
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);

function cycle<T>(list: readonly T[], current: T, dir: 1 | -1): T {
  const i = list.indexOf(current);
  return list[(i + dir + list.length) % list.length]!;
}

const step = (v: number, dir: 1 | -1, lo: number, hi: number, by = 1) =>
  Math.min(hi, Math.max(lo, v + dir * by));

type BoolSetting = {
  [K in keyof Settings]: Settings[K] extends boolean ? K : never;
}[keyof Settings];

export type OptionId =
  | 'players'
  | 'gamesPerSet'
  | 'wind'
  | 'crumble'
  | 'walls'
  | 'visibleShot'
  | 'shotTrail'
  | 'tanksFall'
  | 'explosionsKill'
  | 'computersBuy'
  | 'sound'
  | 'volume'
  | 'flySound'
  | 'background'
  | 'backgroundSpeed'
  | 'motion'
  | 'screenShake';

/** Every setting as a menu row, shared by the main menu and the Options screen. */
export function optionItems(app: App): Record<OptionId, MenuItem> {
  const s = (): Settings => app.settings;
  const set = (patch: Partial<Settings>) => (app.settings = { ...s(), ...patch });
  const toggle = (key: BoolSetting) => () => set({ [key]: !s()[key] });
  return {
    players: {
      id: 'players',
      label: 'Number of players',
      value: () => String(s().players),
      change: (d) => set({ players: step(s().players, d, 2, MAX_PLAYERS) }),
      help: 'Two to ten tanks, humans and computers.',
    },
    gamesPerSet: {
      id: 'gamesPerSet',
      label: 'Games per set',
      value: () => String(s().gamesPerSet),
      change: (d) => set({ gamesPerSet: step(s().gamesPerSet, d, 1, 99) }),
      help: 'Rounds in a set. Long sets reward saving up for big weapons.',
    },
    wind: {
      id: 'wind',
      label: 'Wind',
      value: () => cap(s().wind),
      change: (d) => set({ wind: cycle([...WIND_LEVELS, 'random'] as const, s().wind, d) }),
      help: 'From none to gale. Gales can exceed ten thousand.',
    },
    crumble: {
      id: 'crumble',
      label: 'Crumbling hills',
      value: () => `${s().crumble}%`,
      change: (d) => set({ crumble: step(s().crumble, d, 0, 100, 10) }),
      help: 'How often loose ground falls after a shot.',
    },
    walls: {
      id: 'walls',
      label: 'Rebounding walls',
      value: () => ({ off: 'No', on: 'Yes', random: 'Random' })[s().walls],
      change: (d) => set({ walls: cycle(['off', 'random', 'on'] as const, s().walls, d) }),
      help: 'Shots bounce off the sides and ceiling. Random decides each game.',
    },
    visibleShot: {
      id: 'visibleShot',
      label: 'Visible shot',
      value: () => yesNo(s().visibleShot),
      change: toggle('visibleShot'),
      help: 'When off, shells are invisible in flight.',
    },
    shotTrail: {
      id: 'shotTrail',
      label: 'Shot trace',
      value: () => yesNo(s().shotTrail),
      change: toggle('shotTrail'),
      help: 'Shells leave a trail for the rest of the game.',
    },
    tanksFall: {
      id: 'tanksFall',
      label: 'Tanks fall down',
      value: () => yesNo(s().tanksFall),
      change: toggle('tanksFall'),
      help: 'Tanks fall (and get hurt) when ground is blown away.',
    },
    explosionsKill: {
      id: 'explosionsKill',
      label: 'Explosions kill',
      value: () => yesNo(s().explosionsKill),
      change: toggle('explosionsKill'),
      help: 'Flying debris from destroyed tanks can hurt you.',
    },
    computersBuy: {
      id: 'computersBuy',
      label: 'Computers can buy',
      value: () => yesNo(s().computersBuy),
      change: toggle('computersBuy'),
      help: 'Computer players may buy weapons between games.',
    },
    sound: {
      id: 'sound',
      label: 'Sound effects',
      value: () => onOff(s().sound),
      change: toggle('sound'),
      help: 'Turns all sound on or off (also S during play).',
    },
    volume: {
      id: 'volume',
      label: 'Volume',
      value: () => (s().volume === 0 ? 'Silent' : String(s().volume)),
      change: (d) => set({ volume: step(s().volume, d, 0, 10) }),
      help: 'Master volume for all sound effects.',
    },
    flySound: {
      id: 'flySound',
      label: 'Fly sound',
      value: () => onOff(s().flySound),
      change: toggle('flySound'),
      help: 'Shells whistle in flight. Gets annoying fast.',
    },
    background: {
      id: 'background',
      label: 'Background',
      value: () => BACKGROUND_NAMES[s().background],
      change: (d) => set({ background: cycle(BACKGROUNDS, s().background, d) }),
      help: 'The sky behind the battle. Random picks one each game.',
    },
    backgroundSpeed: {
      id: 'backgroundSpeed',
      label: 'Background speed',
      value: () => (s().backgroundSpeed === 0 ? 'Still' : String(s().backgroundSpeed)),
      change: (d) => set({ backgroundSpeed: step(s().backgroundSpeed, d, 0, 10) }),
      help: 'How fast the background animates.',
    },
    motion: {
      id: 'motion',
      label: 'Reduce motion',
      value: () =>
        ({
          auto: systemPrefersReducedMotion() ? 'Auto (on)' : 'Auto (off)',
          full: 'Off',
          reduced: 'On',
        })[s().motion],
      change: (d) => set({ motion: cycle(['auto', 'reduced', 'full'] as const, s().motion, d) }),
      help: 'Stills the sky, stops shaking, dims flashes. Auto follows your system.',
    },
    screenShake: {
      id: 'screenShake',
      label: 'Screen shake',
      value: () => onOff(s().screenShake),
      change: toggle('screenShake'),
      help: 'Big explosions rattle the battlefield.',
    },
  };
}
