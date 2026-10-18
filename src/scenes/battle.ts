import { LAYOUT } from '../config';
import { Rng } from '../core/rng';
import type { InputEvent, UiAction } from '../input/events';
import { KeyboardController } from '../input/keyboard';
import { PointerController } from '../input/pointer';
import { BattleRenderer } from '../render/battle-renderer';
import type { DebugOverlay } from '../render/debug-overlay';
import { drawHud } from '../render/hud';
import {
  drawOverlay,
  drawToasts,
  overlayHitTest,
  type Overlay,
  type Toast,
} from '../render/overlays';
import type { Screen } from '../render/screen';
import { darken, PLAYER_COLORS } from '../render/tank-sprite';
import { renderSky, TerrainRenderer } from '../render/terrain-renderer';
import { THEMES } from '../render/themes';
import { TrailLayer } from '../render/trail-layer';
import { GUIDANCE_H, GUIDANCE_V, ITEMS } from '../sim/items';
import { DEFAULT_OPTIONS, type GameOptions } from '../sim/options';
import { Round, type PlayerSetup } from '../sim/round';
import { DevOptionsPanel } from '../ui/dev-options';

const TOAST_TICKS = 150;

/**
 * Hot-seat battle on one keyboard and mouse, endless rounds. Owns the UI state around the sim:
 * overlays (pause, help, player status, confirmations), which freeze the sim while open, and
 * transient toast messages.
 */
export class BattleScene {
  private round!: Round;
  private roundNumber = 0;
  private sky!: HTMLCanvasElement;
  private terrainRenderer!: TerrainRenderer;
  private readonly trails = new TrailLayer(LAYOUT.field.w, LAYOUT.field.h);
  private readonly renderer = new BattleRenderer();
  private readonly keyboard = new KeyboardController();
  private readonly pointer: PointerController;
  private options: GameOptions;
  private overlay: Overlay | null = null;
  private toasts: Toast[] = [];
  private soundOn = true;

  constructor(
    container: HTMLElement,
    private readonly screen: Screen,
    private readonly debug: DebugOverlay,
    private readonly seed: number,
    private readonly players: readonly PlayerSetup[],
    options: Partial<GameOptions> = {},
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    new DevOptionsPanel(container, this.options, (o) => (this.options = o));
    this.pointer = new PointerController(
      screen,
      () => this.round,
      () => this.overlay !== null,
    );
    this.newRound();
  }

  /** Read-only views for tests and debugging. */
  get state(): Round {
    return this.round;
  }

  get openOverlay(): Overlay | null {
    return this.overlay;
  }

  private newRound(): void {
    const seed = (this.seed + this.roundNumber * 0x9e3779b1) >>> 0;
    this.roundNumber++;
    this.round = new Round({ seed, players: this.players, options: this.options });
    const theme = new Rng(seed ^ 0x5eed).pick(THEMES);
    const { w, h } = LAYOUT.field;
    this.sky = renderSky(w, h, theme);
    this.terrainRenderer = new TerrainRenderer(w, h, theme);
    this.trails.clear();
  }

  private toast(text: string, color = '#ffffff'): void {
    this.toasts.push({ text, color, ticks: TOAST_TICKS });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  update(): void {
    const events = [...this.keyboard.poll(), ...this.pointer.poll()];
    for (const t of this.toasts) t.ticks--;
    this.toasts = this.toasts.filter((t) => t.ticks > 0);

    // Each key press arrives as a raw 'key' event followed by what it maps to. When an overlay
    // consumes a press, skip the rest of that same press (Esc closes an overlay and also maps
    // to pause, which would reopen it), but keep later presses from the same tick.
    let skipRestOfPress = false;
    for (const e of events) {
      if (e.kind === 'key') skipRestOfPress = false;
      else if (skipRestOfPress) continue;
      if (this.overlay) {
        if (this.handleOverlayInput(e)) skipRestOfPress = true;
        continue;
      }
      if (e.kind === 'ui') this.handleUi(e.action);
      else if (e.kind === 'command') {
        if (this.round.phase === 'roundOver') {
          if (e.cmd.type === 'fire') this.newRound();
        } else {
          this.round.command(e.cmd);
        }
      }
    }
    if (this.overlay) return; // the sim is frozen while an overlay is open

    this.round.tick();
    const roundEvents = this.round.drainEvents();
    this.renderer.onEvents(this.round, roundEvents);
    for (const e of roundEvents) {
      if (e.type === 'fireRejected') {
        this.toast('Laser needs 100+ energy: raise power', '#ff9a6a');
      }
    }
    this.renderer.tick();

    const p = this.round.projectile;
    if (p && this.options.shotTrail) {
      const owner = this.round.tanks[p.ownerId]!;
      this.trails.segment(p.prevX, p.prevY, p.x, p.y, darken(PLAYER_COLORS[owner.color]!, 0.35));
    }
  }

  /** Returns true if the event answered or dismissed the overlay. */
  private handleOverlayInput(e: InputEvent): boolean {
    const o = this.overlay;
    if (!o) return false;
    let answer: 'yes' | 'no' | 'dismiss' | null = null;
    if (e.kind === 'key') {
      if (o.kind === 'confirm') {
        if (e.code === 'KeyY' || e.code === 'Enter' || e.code === 'NumpadEnter') answer = 'yes';
        else if (e.code === 'KeyN' || e.code === 'Escape') answer = 'no';
      } else {
        answer = 'dismiss';
      }
    } else if (e.kind === 'overlayClick') {
      answer = o.kind === 'confirm' ? overlayHitTest(o, e.x, e.y) : 'dismiss';
    }
    if (!answer) return false;
    this.overlay = null;
    if (answer !== 'yes' || o.kind !== 'confirm') return true;
    if (o.what === 'massKill') {
      if (this.round.command({ type: 'massKill' })) {
        this.toast('Mass kill: everyone dies after this turn', '#ff6a6a');
      }
    } else {
      this.toast('Game aborted', '#ff6a6a');
      this.newRound();
    }
    return true;
  }

  private handleUi(a: UiAction): void {
    switch (a.type) {
      case 'pause':
        this.overlay = { kind: 'pause' };
        break;
      case 'help':
        this.overlay = { kind: 'help' };
        break;
      case 'status':
        if (this.round.tanks[a.tankId]) this.overlay = { kind: 'status', tankId: a.tankId };
        break;
      case 'sound':
        this.soundOn = !this.soundOn;
        this.toast(this.soundOn ? 'Sound on' : 'Sound off');
        break;
      case 'massKill':
        if (this.round.phase !== 'roundOver') this.overlay = { kind: 'confirm', what: 'massKill' };
        break;
      case 'quit':
        this.overlay = { kind: 'confirm', what: 'quit' };
        break;
      case 'guidance': {
        const idx = a.axis === 'H' ? GUIDANCE_H : GUIDANCE_V;
        const t = this.round.current;
        if (!t || !(t.inventory[idx]! > 0)) this.toast(`No ${ITEMS[idx]!.name}`, '#ff9a6a');
        else this.toast('Guidance systems arrive in Stage 7', '#ff9a6a');
        break;
      }
    }
  }

  render(alpha: number): void {
    const { ctx } = this.screen;
    const { field } = LAYOUT;
    const round = this.round;
    this.terrainRenderer.update(round.terrain);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.screen.width, this.screen.height);
    drawHud(ctx, round, {
      soundOn: this.soundOn,
      hover: this.overlay ? null : this.pointer.hover,
      pressed: this.pointer.pressed,
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(field.x, field.y, field.w, field.h);
    ctx.clip();
    ctx.translate(field.x, field.y);
    ctx.drawImage(this.sky, 0, 0);
    ctx.drawImage(this.trails.canvas, 0, 0);
    ctx.drawImage(this.terrainRenderer.canvas, 0, 0);
    this.renderer.drawField(
      ctx,
      round,
      this.overlay ? 0 : alpha,
      this.options.visibleShot,
      this.pointer.aimPreview,
    );
    ctx.restore();

    ctx.strokeStyle = round.walls ? '#e040ff' : '#7a3aa0';
    ctx.lineWidth = 1;
    ctx.strokeRect(field.x - 0.5, field.y - 0.5, field.w + 1, field.h + 1);
    this.renderer.drawRoundOver(ctx, round);
    drawToasts(ctx, this.toasts);
    if (this.overlay) {
      drawOverlay(ctx, this.overlay, {
        round,
        roundNumber: this.roundNumber,
        soundOn: this.soundOn,
      });
    }

    this.debug.set('round', `${this.roundNumber} (${round.terrainStyle})`);
    this.debug.set('phase', round.phase);
  }
}
