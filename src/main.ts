import './style.css';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH, TICK_RATE } from './config';
import { GameLoop } from './core/loop';
import { DebugOverlay } from './render/debug-overlay';
import { Screen } from './render/screen';
import { TestPattern } from './render/test-pattern';

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
const scene = new TestPattern(LOGICAL_WIDTH, LOGICAL_HEIGHT, 1991);

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
  render(alpha) {
    scene.render(screen.ctx, alpha);
    debug.set('ticks', ticks);
    debug.frame();
  },
}).start();
