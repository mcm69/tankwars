import { Sfx } from './audio/sfx';
import { Synth } from './audio/synth';
import { CHEAPEST_PRICE } from './game/economy';
import { GameSet } from './game/set';
import { DEFAULT_SETTINGS, defaultSlots, type PlayerSlot, type Settings } from './game/settings';
import { browserStore, Storage, type SetSnapshot } from './persist/storage';
import type { DebugOverlay } from './render/debug-overlay';
import type { Screen } from './render/screen';
import { BattleScene } from './scenes/battle';
import { MenuScene } from './scenes/menu';
import { OptionsScene } from './scenes/options';
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
  private _settings: Settings;
  slots: PlayerSlot[];
  set: GameSet | null = null;
  /** Sound effects; reads `settings` on every call. */
  readonly audio = new Sfx(new Synth(), () => this.settings);
  private scene: Scene;
  private startInventory: number[] | undefined;
  private seedOverride: number | undefined;
  private startMoney = 0;
  /** Off for dev `?play` sets, so they never overwrite a real saved game. */
  private persistSet = true;

  constructor(
    readonly container: HTMLElement,
    readonly screen: Screen,
    readonly debug: DebugOverlay,
    readonly storage: Storage = new Storage(browserStore()),
  ) {
    this._settings = storage.loadSettings();
    this.slots = storage.loadSlots();
    this.scene = new TitleScene(this);
  }

  get settings(): Settings {
    return this._settings;
  }

  /** Every settings change is remembered. */
  set settings(s: Settings) {
    this._settings = s;
    this.storage.saveSettings(s);
  }

  saveSlots(): void {
    this.storage.saveSlots(this.slots);
  }

  /** The unfinished set waiting to be resumed, if any. */
  get savedSet(): SetSnapshot | null {
    return this.storage.loadSet();
  }

  restoreDefaults(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.slots = defaultSlots();
    this.saveSlots();
  }

  private saveSet(stage: SetSnapshot['stage']): void {
    if (this.persistSet && this.set) this.storage.saveSet(this.set.snapshot(stage));
  }

  private clearSavedSet(): void {
    if (this.persistSet) this.storage.clearSet();
  }

  get sceneName(): string {
    return this.scene.name;
  }

  get currentScene(): Scene {
    return this.scene;
  }

  private goto(scene: Scene): void {
    this.audio.stopAll();
    this.scene.dispose();
    this.scene = scene;
  }

  showTitle(): void {
    this.goto(new TitleScene(this));
  }

  showMenu(message: string | null = null, focus?: string): void {
    this.set = null;
    this.goto(new MenuScene(this, message, focus));
  }

  showOptions(): void {
    this.goto(new OptionsScene(this));
  }

  showSetup(): void {
    this.goto(new SetupScene(this));
  }

  /** Starts a new set with the current settings and slots. */
  startSet(): void {
    this.persistSet = this.persistSet && this.startInventory === undefined;
    const seed = this.seedOverride ?? (Math.random() * 2 ** 32) >>> 0; // UI-level: picks the set
    this.set = new GameSet(this.settings, this.slots, seed, this.startInventory, this.startMoney);
    this.startRound();
  }

  startRound(): void {
    const set = this.set;
    if (!set) return this.showMenu();
    if (set.finished) {
      this.clearSavedSet();
      return this.goto(new ResultsScene(this, set, true));
    }
    // Saved before the game starts (after shopping): a reload replays this game from its start.
    this.saveSet('round');
    this.goto(new BattleScene(this, set, set.startRound()));
  }

  /** Picks up a saved set where it left off. */
  resumeSet(): void {
    const snap = this.savedSet;
    if (!snap) return this.showMenu('Nothing to resume');
    this.set = GameSet.restore(snap);
    if (snap.stage === 'between') this.goto(new ResultsScene(this, this.set, false));
    else this.startRound();
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
    if (set.finished) this.clearSavedSet();
    else this.saveSet('between'); // shopping comes next
    this.goto(new ResultsScene(this, set, set.finished));
  }

  abortSet(): void {
    this.clearSavedSet();
    this.showMenu('Game aborted');
  }

  /** Dev/test shortcut: skip the menus and start a set immediately. */
  quickStart(q: QuickStart): void {
    this.persistSet = false;
    this._settings = { ...this._settings, ...q.settings }; // not saved: dev shortcut
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

  renderSides(ctx: CanvasRenderingContext2D): void {
    if (this.screen.sideWidth > 0) this.scene.renderSides?.(ctx);
  }
}
