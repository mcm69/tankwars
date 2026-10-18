import './style.css';
import { App } from './app';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TICK_RATE } from './config';
import { GameLoop } from './core/loop';
import { defaultSlots, type PlayerSlot } from './game/settings';
import { DebugOverlay } from './render/debug-overlay';
import { Screen } from './render/screen';
import { BattleScene } from './scenes/battle';
import { TerrainLab } from './scenes/terrain-lab';
import { fullInventory, itemIndex } from './sim/items';
import type { Phase, Round } from './sim/round';
import { optionsFromParams } from './ui/options-params';

declare global {
  interface Window {
    /** Read-only debug handle for tests and the console. */
    __tankwars?: {
      readonly ticks: number;
      readonly scene: string;
      readonly phase: Phase | undefined;
      readonly round: Round | undefined;
      readonly overlay: string | null;
      readonly app: App | undefined;
    };
  }
}

const container = document.getElementById('app');
if (!container) throw new Error('#app missing');

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam ? seedParam : undefined;

const screen = new Screen(container, LOGICAL_WIDTH, LOGICAL_HEIGHT);
const debug = new DebugOverlay(container);

let ticks = 0;
let update: () => void;
let render: (alpha: number) => void;
let app: App | undefined;

if (params.has('lab')) {
  // ?lab: the terrain lab debug scene.
  const lab = new TerrainLab(screen, debug, seed ?? 1991);
  update = () => lab.update();
  render = () => lab.render();
} else {
  const a = new App(container, screen, debug);
  app = a;
  if (params.has('play')) {
    // ?play skips the title and menus: ?players=N, ?cpu=N (last N players are computers),
    // ?games=N, ?seed=N, ?arsenal, plus option params like ?wind=none&walls=on&crumble=100.
    const players = Math.min(10, Math.max(2, Number(params.get('players')) || 2));
    const cpu = Math.min(players, Math.max(0, Number(params.get('cpu')) || 0));
    const slots: PlayerSlot[] = defaultSlots().map((s, i) => ({
      ...s,
      kind: i >= players - cpu ? 'computer' : 'human',
      name: i >= players - cpu ? `CPU ${i + 1}` : `Player ${i + 1}`,
    }));
    a.quickStart({
      settings: {
        ...optionsFromParams(params),
        players,
        gamesPerSet: Math.min(99, Math.max(1, Number(params.get('games')) || 99)),
      },
      slots,
      ...(seed !== undefined ? { seed } : {}),
      ...(params.has('arsenal') ? { inventory: devArsenal() } : {}),
    });
  }
  update = () => a.update();
  render = (alpha) => a.render(alpha);
}

const battle = () => {
  const s = app?.currentScene;
  return s instanceof BattleScene ? s : undefined;
};

window.__tankwars = {
  get ticks() {
    return ticks;
  },
  get scene() {
    return app?.sceneName ?? 'lab';
  },
  get phase() {
    return battle()?.state.phase;
  },
  get round() {
    return battle()?.state;
  },
  get overlay() {
    return battle()?.openOverlay?.kind ?? null;
  },
  get app() {
    return app;
  },
};

new GameLoop(TICK_RATE, {
  update() {
    ticks++;
    update();
  },
  render(alpha) {
    render(alpha);
    debug.set('scene', window.__tankwars!.scene);
    debug.set('ticks', ticks);
    debug.frame();
  },
}).start();

/** ?arsenal: plenty of every weapon (and laser energy) for trying them out. */
function devArsenal(): number[] {
  const inv = fullInventory(20);
  inv[itemIndex('laser')] = 5000;
  return inv;
}
