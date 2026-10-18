import './style.css';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TICK_RATE } from './config';
import { GameLoop } from './core/loop';
import { DebugOverlay } from './render/debug-overlay';
import { Screen } from './render/screen';
import { BattleScene } from './scenes/battle';
import { TerrainLab } from './scenes/terrain-lab';
import type { Phase, Round } from './sim/round';

declare global {
  interface Window {
    /** Read-only debug handle for tests and the console. */
    __tankwars?: {
      readonly ticks: number;
      readonly phase: Phase | undefined;
      readonly round: Round | undefined;
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
// ?lab opens the terrain lab; otherwise a hot-seat battle (?players=N, ?seed=N).
const battle = params.has('lab')
  ? null
  : new BattleScene(
      screen,
      debug,
      seed,
      Array.from({ length: playerCount }, (_, i) => ({ name: `Player ${i + 1}`, color: i })),
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
