import { CHEAPEST_PRICE } from './game/economy';
import { GameSet } from './game/set';
import { DEFAULT_SETTINGS, defaultSlots, type PlayerSlot, type Settings } from './game/settings';
import type { DebugOverlay } from './render/debug-overlay';
import type { Screen } from './render/screen';
import { BattleScene } from './scenes/battle';
import { MenuScene } from './scenes/menu';
import { ResultsScene } from './scenes/results';
import type { Scene } from './scenes/scene';
import { SetupScene } from './scenes/setup';
import { ShopScene } from './scenes/shop';
import { TitleScene } from './scenes/title';

/** Options for jumping straight into a set (dev/test URLs). */
export interface QuickStart {
  settings: Partial<Settings>;
  slots?: PlayerSlot[];
  seed?: number;
  inventory?: number[];
  money?: number;
}

/**
 * Owns the app-wide state (settings, player slots, the set in progress) and moves between
 * scenes: title → menu → setup → battle ⇄ results → final → menu.
 */
export class App {
  settings: Settings = { ...DEFAULT_SETTINGS };
  slots: PlayerSlot[] = defaultSlots();
  set: GameSet | null = null;
  private scene: Scene;
  private startInventory: number[] | undefined;
  private seedOverride: number | undefined;
  private startMoney = 0;

  constructor(
    readonly container: HTMLElement,
    readonly screen: Screen,
    readonly debug: DebugOverlay,
  ) {
    this.scene = new TitleScene(this);
  }

  get sceneName(): string {
    return this.scene.name;
  }

  get currentScene(): Scene {
    return this.scene;
  }

  private goto(scene: Scene): void {
    this.scene.dispose();
    this.scene = scene;
  }

  showTitle(): void {
    this.goto(new TitleScene(this));
  }

  showMenu(message: string | null = null): void {
    this.set = null;
    this.goto(new MenuScene(this, message));
  }

  showSetup(): void {
    this.goto(new SetupScene(this));
  }

  /** Starts a new set with the current settings and slots. */
  startSet(): void {
    const seed = this.seedOverride ?? (Math.random() * 2 ** 32) >>> 0; // UI-level: picks the set
    this.set = new GameSet(this.settings, this.slots, seed, this.startInventory, this.startMoney);
    this.startRound();
  }

  startRound(): void {
    const set = this.set;
    if (!set) return this.showMenu();
    if (set.finished) return this.goto(new ResultsScene(this, set, true));
    this.goto(new BattleScene(this, set, set.startRound()));
  }

  /**
   * After the between-games status screen: every human who can afford something visits the
   * shop in turn, then the next game starts.
   */
  afterStatus(): void {
    const set = this.set;
    if (!set) return this.showMenu();
    set.computersShop();
    const shoppers = set.players.filter((p) => p.kind === 'human' && p.money >= CHEAPEST_PRICE);
    const next = (): void => {
      const p = shoppers.shift();
      if (p) this.goto(new ShopScene(this, p, next));
      else this.startRound();
    };
    next();
  }

  /** Called by the battle scene once a round is over and acknowledged. */
  roundFinished(): void {
    const set = this.set;
    if (!set?.round) return this.showMenu();
    set.finishRound(set.round);
    this.goto(new ResultsScene(this, set, set.finished));
  }

  abortSet(): void {
    this.showMenu('Game aborted');
  }

  /** Dev/test shortcut: skip the menus and start a set immediately. */
  quickStart(q: QuickStart): void {
    this.settings = { ...this.settings, ...q.settings };
    if (q.slots) this.slots = q.slots;
    this.seedOverride = q.seed;
    this.startInventory = q.inventory;
    this.startMoney = q.money ?? 0;
    this.startSet();
  }

  update(): void {
    this.scene.update();
  }

  render(alpha: number): void {
    this.scene.render(alpha);
  }
}
