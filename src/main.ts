import './style.css';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TICK_RATE } from './config';
import { GameLoop } from './core/loop';
import { DebugOverlay } from './render/debug-overlay';
import { Screen } from './render/screen';
import { BattleScene } from './scenes/battle';
import { TerrainLab } from './scenes/terrain-lab';
import { fullInventory, itemIndex } from './sim/items';
import { optionsFromParams } from './ui/options-params';
import type { Phase, Round } from './sim/round';

declare global {
  interface Window {
    /** Read-only debug handle for tests and the console. */
    __tankwars?: {
      readonly ticks: number;
      readonly phase: Phase | undefined;
      readonly round: Round | undefined;
      readonly overlay: string | null;
    };
  }
}

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam ? seedParam : 1991;
const playerCount = Math.min(10, Math.max(2, Number(params.get('players')) || 2));

const screen = new Screen(app, LOGICAL_WIDTH, LOGICAL_HEIGHT);
const debug = new DebugOverlay(app);
// ?lab opens the terrain lab; otherwise a hot-seat battle (?players=N, ?seed=N, plus game
// options such as ?wind=none&walls=on&crumble=100&fall=0&visible=0&trail=0).
const battle = params.has('lab')
  ? null
  : new BattleScene(
      app,
      screen,
      debug,
      seed,
      Array.from({ length: playerCount }, (_, i) => ({
        name: `Player ${i + 1}`,
        color: i,
        ...(params.has('arsenal') ? { inventory: devArsenal() } : {}),
      })),
      optionsFromParams(params),
    );
const scene = battle ?? new TerrainLab(screen, debug, seed);

let ticks = 0;
window.__tankwars = {
  get ticks() {
    return ticks;
  },
  get phase() {
    return battle?.state.phase;
  },
  get round() {
    return battle?.state;
  },
  get overlay() {
    return battle?.openOverlay?.kind ?? null;
  },
};

new GameLoop(TICK_RATE, {
  update() {
    ticks++;
    scene.update();
  },
  render(alpha) {
    scene.render(alpha);
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
