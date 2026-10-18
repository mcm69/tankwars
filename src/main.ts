import './style.css';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TICK_RATE } from './config';
import { GameLoop } from './core/loop';
import { DebugOverlay } from './render/debug-overlay';
import { Screen } from './render/screen';
import { TerrainLab } from './scenes/terrain-lab';

declare global {
  interface Window {
    /** Read-only debug handle for tests and the console. */
    __tankwars?: { readonly ticks: number };
  }
}

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

const screen = new Screen(app, LOGICAL_WIDTH, LOGICAL_HEIGHT);
const debug = new DebugOverlay(app);
const seedParam = Number(new URLSearchParams(location.search).get('seed'));
const scene = new TerrainLab(
  screen,
  debug,
  Number.isFinite(seedParam) && seedParam ? seedParam : 1991,
);

let ticks = 0;
window.__tankwars = {
  get ticks() {
    return ticks;
  },
};

new GameLoop(TICK_RATE, {
  update() {
    ticks++;
    scene.update();
  },
  render() {
    scene.render();
    debug.set('ticks', ticks);
    debug.frame();
  },
}).start();
