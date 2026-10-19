import './style.css';
import { AI_IDS, type AiId } from './ai/registry';
import { buildDebugState, type DebugState } from './debug/debug-state';
import { showErrorPanel } from './debug/error-panel';
import { App } from './app';
import { TICK_RATE } from './config';
import { GameLoop } from './core/loop';
import { BACKGROUNDS, defaultSlots, type Background, type PlayerSlot } from './game/settings';
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
      readonly visuals: BattleScene['visuals'] | null;
      /** Everything needed to replay the current round (see `npm run replay`). */
      debugState(): DebugState;
      readonly touchLayout: Record<string, { x: number; y: number; w: number; h: number }> | null;
    };
  }
}

const container = document.getElementById('app');
if (!container) throw new Error('#app missing');

const params = new URLSearchParams(location.search);
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam ? seedParam : undefined;

// Touch layout (big side controls) on coarse-pointer devices; ?touch=1 / ?touch=0 overrides.
const touchParam = params.get('touch');
const touch = touchParam === null ? matchMedia('(pointer: coarse)').matches : touchParam !== '0';
const screen = new Screen(container, touch);
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
    // ?ai=lobber (their personality; default random),
    // ?games=N, ?seed=N, ?arsenal, ?money=N, ?bg=stars&bgspeed=N, plus option params like ?wind=none&walls=on&crumble=100.
    const players = Math.min(10, Math.max(2, Number(params.get('players')) || 2));
    const cpu = Math.min(players, Math.max(0, Number(params.get('cpu')) || 0));
    const aiParam = params.get('ai');
    const ai: AiId = AI_IDS.includes(aiParam as AiId) ? (aiParam as AiId) : 'random';
    const slots: PlayerSlot[] = defaultSlots().map((s, i) => ({
      ...s,
      kind: i >= players - cpu ? 'computer' : 'human',
      ai,
      name: i >= players - cpu ? `CPU ${i + 1}` : `Player ${i + 1}`,
    }));
    a.quickStart({
      settings: {
        ...optionsFromParams(params),
        players,
        gamesPerSet: Math.min(99, Math.max(1, Number(params.get('games')) || 99)),
        ...(BACKGROUNDS.includes(params.get('bg') as Background)
          ? { background: params.get('bg') as Background }
          : {}),
        ...(params.has('bgspeed')
          ? { backgroundSpeed: Math.min(10, Math.max(0, Number(params.get('bgspeed')) || 0)) }
          : {}),
      },
      slots,
      ...(seed !== undefined ? { seed } : {}),
      ...(params.has('arsenal') ? { inventory: devArsenal() } : {}),
      ...(params.has('money') ? { money: Number(params.get('money')) || 0 } : {}),
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
  get visuals() {
    return battle()?.visuals ?? null;
  },
  get touchLayout() {
    return battle()?.touchLayout ?? null;
  },
  debugState() {
    return buildDebugState(app);
  },
};

// Offline play in production builds (dev builds would cache stale modules).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // No offline support (e.g. file:// or a private window); the game works regardless.
    });
  });
}

// iOS pinch-zoom gestures aren't covered by touch-action.
document.addEventListener('gesturestart', (e) => e.preventDefault());
// Portrait on a touch device shows a "rotate" prompt (CSS); the game holds still meanwhile.
const portrait = matchMedia('(orientation: portrait) and (pointer: coarse)');

// Error boundary: any uncaught error stops the game and shows a panel with debug info.
const loop = new GameLoop(TICK_RATE, {
  update() {
    if (portrait.matches) return;
    guard(update);
    ticks++;
  },
  render(alpha) {
    guard(() => renderFrame(alpha));
  },
});

function guard(fn: () => void): void {
  try {
    fn();
  } catch (e) {
    crash(e);
  }
}

function crash(e: unknown): void {
  loop.stop();
  try {
    app?.audio.stopAll();
  } catch {
    // Already crashing; sound can stay as it is.
  }
  showErrorPanel(e, app);
}

window.addEventListener('error', (e) => crash(e.error ?? e.message));
window.addEventListener('unhandledrejection', (e) => crash(e.reason));
loop.start();

function renderFrame(alpha: number): void {
  // Scenes draw in core (640×400) coordinates; the touch layout adds side panels around it.
  const { ctx } = screen;
  if (screen.coreOffsetX > 0) {
    ctx.fillStyle = '#05030a';
    ctx.fillRect(0, 0, screen.width, screen.height);
  }
  ctx.save();
  ctx.translate(screen.coreOffsetX, 0);
  render(alpha);
  ctx.restore();
  app?.renderSides(ctx);
  debug.set('scene', window.__tankwars!.scene);
  debug.set('ticks', ticks);
  debug.frame();
}

/** ?arsenal: plenty of every weapon, laser energy, guidance and shields for trying them out. */
function devArsenal(): number[] {
  const inv = fullInventory(20);
  inv[itemIndex('laser')] = 5000;
  inv[itemIndex('guidanceH')] = 5;
  inv[itemIndex('guidanceV')] = 5;
  inv[itemIndex('shieldEnergy')] = 1000;
  inv[itemIndex('shieldInertia')] = 100;
  return inv;
}
