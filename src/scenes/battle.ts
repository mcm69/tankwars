import { planTurn, type AiMemory, type AiPlan } from '../ai/registry';
import type { App } from '../app';
import { LAYOUT, LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../config';
import { Rng } from '../core/rng';
import type { GameSet } from '../game/set';
import type { InputEvent, UiAction } from '../input/events';
import { KeyboardController } from '../input/keyboard';
import { PointerController } from '../input/pointer';
import { TouchControls } from '../input/touch-controls';
import { drawTouchPanels } from '../render/touch-panel';
import { BattleRenderer } from '../render/battle-renderer';
import { drawHud } from '../render/hud';
import {
  drawOverlay,
  drawToasts,
  overlayHitTest,
  type Overlay,
  type PauseAction,
  type Toast,
} from '../render/overlays';
import { darken, PLAYER_COLORS } from '../render/tank-sprite';
import { renderSky, TerrainRenderer } from '../render/terrain-renderer';
import { THEMES } from '../render/themes';
import { TrailLayer } from '../render/trail-layer';
import { GUIDANCE_H, GUIDANCE_V, ITEMS, LEAD_BALL } from '../sim/items';
import type { Round } from '../sim/round';
import { maxPower, TANK_HALF_WIDTH, TANK_HEIGHT } from '../sim/tank';
import type { Scene } from './scene';

const TOAST_TICKS = 150;
/** Ticks a computer "thinks" before playing (shorter when no humans are watching). */
const AI_THINK_TICKS = 45;
const AI_THINK_TICKS_FAST = 12;
/** Sim ticks per frame when only computers play. */
const ALL_COMPUTER_SPEED = 3;
/**
 * Computer-only games that drag on this long (shots per player) end in a mass kill, the way a
 * human would press Ctrl-M in the original when "battles between computers go on for hours".
 */
const STALEMATE_SHOTS_PER_PLAYER = 30;
/** After a round ends: minimum ticks before a key continues, and the auto-continue delay. */
const ROUND_OVER_MIN_TICKS = 30;
const ROUND_OVER_AUTO_TICKS = 150;

/**
 * One round of a set: hot-seat humans on keyboard/mouse plus computer players. Owns the UI
 * state around the sim: overlays (pause, help, player status, confirmations), which freeze the
 * sim while open, and transient toast messages.
 */
export class BattleScene implements Scene {
  readonly name = 'battle';
  private readonly sky: HTMLCanvasElement;
  private readonly terrainRenderer: TerrainRenderer;
  private readonly trails = new TrailLayer(LAYOUT.field.w, LAYOUT.field.h);
  private readonly renderer = new BattleRenderer();
  private readonly keyboard = new KeyboardController();
  private readonly pointer: PointerController;
  /** Side-panel touch buttons, in the touch layout only. */
  private readonly touch: TouchControls | null;
  private readonly aiRng: Rng;
  private overlay: Overlay | null = null;
  private toasts: Toast[] = [];
  private thinkTicks = 0;
  private aiPlan: AiPlan | null = null;
  private readonly aiMemory = new Map<number, AiMemory>();
  private overTicks = 0;

  constructor(
    private readonly app: App,
    private readonly set: GameSet,
    private readonly round: Round,
  ) {
    this.pointer = new PointerController(
      app.screen,
      () => this.round,
      () => this.overlay !== null,
    );
    this.touch =
      app.screen.sideWidth > 0 ? new TouchControls(app.screen, () => this.overlay !== null) : null;
    const seed = set.roundSeed();
    // Presentation and AI use their own streams so they never perturb the round's RNG.
    const theme = new Rng(seed ^ 0x5eed).pick(THEMES);
    this.aiRng = new Rng(seed ^ 0xa1);
    const { w, h } = LAYOUT.field;
    this.sky = renderSky(w, h, theme);
    this.terrainRenderer = new TerrainRenderer(w, h, theme);
  }

  /** Read-only views for tests and debugging. */
  get state(): Round {
    return this.round;
  }

  get openOverlay(): Overlay | null {
    return this.overlay;
  }

  get touchLayout(): TouchControls['layout'] | null {
    return this.touch?.layout ?? null;
  }

  private isHumanTurn(): boolean {
    const t = this.round.current;
    return !!t && this.set.players[t.id]?.kind === 'human';
  }

  private toast(text: string, color = '#ffffff'): void {
    this.toasts.push({ text, color, ticks: TOAST_TICKS });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  update(): void {
    const events = [...this.keyboard.poll(), ...this.pointer.poll(), ...(this.touch?.poll() ?? [])];
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
      if (this.round.phase === 'roundOver') {
        if (this.overTicks >= ROUND_OVER_MIN_TICKS && e.kind !== 'overlayClick') {
          this.app.roundFinished();
          return;
        }
        continue;
      }
      if (e.kind === 'ui') this.handleUi(e.action);
      else if (e.kind === 'command' && this.isHumanTurn()) this.round.command(e.cmd);
    }
    const p = this.round.projectile;
    this.app.audio.flying(p && !this.overlay ? this.round.terrain.height - p.y : null);
    if (this.overlay) return; // the sim is frozen while an overlay is open

    if (this.round.phase === 'roundOver') {
      this.overTicks++;
      if (this.overTicks > ROUND_OVER_AUTO_TICKS && this.set.allComputers) {
        this.app.roundFinished();
        return;
      }
    }
    // With no humans watching, play at triple speed (the original sped up computer-only games).
    const steps = this.set.allComputers ? ALL_COMPUTER_SPEED : 1;
    for (let i = 0; i < steps && this.round.phase !== 'roundOver'; i++) this.simStep();
  }

  /** One sim tick plus everything that reacts to it. */
  private simStep(): void {
    this.stepComputer();
    this.round.tick();
    const roundEvents = this.round.drainEvents();
    this.renderer.onEvents(this.round, roundEvents);
    for (const e of roundEvents) {
      // Turn chimes only for humans; computer turns would chirp nonstop.
      if (e.type !== 'turn' || this.set.players[e.tankId]?.kind === 'human') {
        this.app.audio.roundEvent(e);
      }
      if (e.type === 'fireRejected' && this.isHumanTurn()) {
        this.toast('Laser needs 100+ energy: raise power', '#ff9a6a');
      }
    }
    this.renderer.tick();

    const p = this.round.projectile;
    if (p && this.set.settings.shotTrail) {
      const owner = this.round.tanks[p.ownerId]!;
      this.trails.segment(p.prevX, p.prevY, p.x, p.y, darken(PLAYER_COLORS[owner.color]!, 0.35));
    }
  }

  /**
   * Lets a computer player take its turn: a short "thinking" pause, then the turret visibly
   * swings and the power winds to the planned values before it fires. With no humans playing,
   * it all happens at once.
   */
  private stepComputer(): void {
    const t = this.round.current;
    const player = t ? this.set.players[t.id] : undefined;
    if (
      this.round.phase !== 'aiming' ||
      !t ||
      !player ||
      player.kind !== 'computer' ||
      !player.ai
    ) {
      this.thinkTicks = 0;
      this.aiPlan = null;
      return;
    }
    const fast = this.set.allComputers;
    if (
      fast &&
      !this.round.massKillPending &&
      this.round.shotLog.length >= STALEMATE_SHOTS_PER_PLAYER * this.set.players.length
    ) {
      this.round.command({ type: 'massKill' });
      this.toast('Stalemate! Mass kill after this turn', '#ff6a6a');
    }
    if (!this.aiPlan) {
      this.thinkTicks++;
      if (this.thinkTicks < (fast ? AI_THINK_TICKS_FAST : AI_THINK_TICKS)) return;
      let memory = this.aiMemory.get(t.id);
      if (!memory) this.aiMemory.set(t.id, (memory = {}));
      this.aiPlan = planTurn(player.ai, this.round, this.aiRng, memory);
      if (!this.aiPlan) return;
      this.round.command({ type: 'selectWeapon', index: this.aiPlan.weapon });
    }
    const plan = this.aiPlan;
    const wantPower = Math.min(plan.power, maxPower(t));
    const da = plan.angle - t.angle;
    const dp = wantPower - t.power;
    if (da !== 0) this.round.command({ type: 'aim', delta: clampStep(da, fast ? 180 : 2) });
    if (dp !== 0) this.round.command({ type: 'power', delta: clampStep(dp, fast ? 1000 : 25) });
    if (da !== 0 || dp !== 0) return;
    this.aiPlan = null;
    this.thinkTicks = 0;
    if (!this.round.command({ type: 'fire' })) {
      // Couldn't fire what it picked (e.g. a laser without energy): lob a Lead Ball instead.
      this.round.command({ type: 'selectWeapon', index: LEAD_BALL });
      this.round.command({ type: 'fire' });
    }
  }

  /** Returns true if the event answered or dismissed the overlay. */
  private handleOverlayInput(e: InputEvent): boolean {
    const o = this.overlay;
    if (!o) return false;
    if (o.kind === 'target') return this.handleTargetInput(o, e);
    let answer: 'yes' | 'no' | 'dismiss' | null = null;
    if (e.kind === 'key') {
      if (o.kind === 'confirm') {
        if (e.code === 'KeyY' || e.code === 'Enter' || e.code === 'NumpadEnter') answer = 'yes';
        else if (e.code === 'KeyN' || e.code === 'Escape') answer = 'no';
      } else {
        answer = 'dismiss';
      }
    } else if (e.kind === 'overlayClick') {
      if (o.kind === 'pause') {
        const action = overlayHitTest(o, e.x, e.y);
        if (action && action !== 'yes' && action !== 'no') return this.pauseAction(action);
        answer = 'dismiss';
      } else {
        const hit = o.kind === 'confirm' ? overlayHitTest(o, e.x, e.y) : 'dismiss';
        answer = hit === 'yes' || hit === 'no' || hit === 'dismiss' ? hit : null;
      }
    }
    if (!answer) return false;
    this.overlay = null;
    if (answer !== 'yes' || o.kind !== 'confirm') return true;
    if (o.what === 'massKill') {
      if (this.round.command({ type: 'massKill' })) {
        this.toast('Mass kill: everyone dies after this turn', '#ff6a6a');
      }
    } else {
      this.app.abortSet();
    }
    return true;
  }

  /** Buttons on the Game Status panel (touch players have no K/Q keys). */
  private pauseAction(action: PauseAction): boolean {
    this.overlay = null;
    if (action === 'help') this.overlay = { kind: 'help' };
    else if (action === 'massKill' && this.round.phase !== 'roundOver') {
      this.overlay = { kind: 'confirm', what: 'massKill' };
    } else if (action === 'quit') this.overlay = { kind: 'confirm', what: 'quit' };
    return true;
  }

  /** Guidance target picker: ←→ cycle, Enter confirms, Esc cancels, or click a tank. */
  private handleTargetInput(o: Extract<Overlay, { kind: 'target' }>, e: InputEvent): boolean {
    const n = o.candidates.length;
    const confirm = (targetId: number) => {
      this.overlay = null;
      if (this.round.command({ type: 'setGuidance', axis: o.axis, targetId })) {
        const t = this.round.tanks[targetId]!;
        this.toast(
          `${o.axis === 'H' ? "Herb's" : "Vick's"} guidance locked on ${t.name}`,
          '#ff9a6a',
        );
      }
    };
    if (e.kind === 'key') {
      if (e.code === 'ArrowLeft') o.index = (o.index + n - 1) % n;
      else if (e.code === 'ArrowRight') o.index = (o.index + 1) % n;
      else if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
        confirm(o.candidates[o.index]!);
      } else if (e.code === 'Escape') this.overlay = null;
      else return false;
      return true;
    }
    if (e.kind === 'overlayClick') {
      const fx = e.x - LAYOUT.field.x;
      const fy = e.y - LAYOUT.field.y;
      const hit = o.candidates.find((id) => {
        const t = this.round.tanks[id]!;
        return (
          Math.abs(t.x - fx) <= TANK_HALF_WIDTH + 4 && fy >= t.y - TANK_HEIGHT - 4 && fy <= t.y + 4
        );
      });
      if (hit !== undefined) confirm(hit);
      return hit !== undefined;
    }
    return false;
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
      case 'sound': {
        const sound = !this.app.settings.sound;
        this.app.settings = { ...this.app.settings, sound };
        this.toast(sound ? 'Sound on' : 'Sound off');
        break;
      }
      case 'massKill':
        if (this.round.phase !== 'roundOver') this.overlay = { kind: 'confirm', what: 'massKill' };
        break;
      case 'quit':
        this.overlay = { kind: 'confirm', what: 'quit' };
        break;
      case 'guidance': {
        const idx = a.axis === 'H' ? GUIDANCE_H : GUIDANCE_V;
        const t = this.round.current;
        if (!t || this.round.phase !== 'aiming' || !this.isHumanTurn()) break;
        if (!(t.inventory[idx]! > 0)) {
          this.toast(`No ${ITEMS[idx]!.name}`, '#ff9a6a');
        } else if (t.guidance?.axis === a.axis) {
          this.round.command({ type: 'clearGuidance' });
          this.toast(`${ITEMS[idx]!.short} off`, '#ff9a6a');
        } else {
          const candidates = this.round.order.filter(
            (id) => id !== t.id && this.round.tanks[id]!.alive,
          );
          // Start on the nearest enemy.
          let index = 0;
          candidates.forEach((id, i) => {
            const d = Math.abs(this.round.tanks[id]!.x - t.x);
            if (d < Math.abs(this.round.tanks[candidates[index]!]!.x - t.x)) index = i;
          });
          if (candidates.length) this.overlay = { kind: 'target', axis: a.axis, candidates, index };
        }
        break;
      }
    }
  }

  render(alpha: number): void {
    const { ctx } = this.app.screen;
    const { field } = LAYOUT;
    const round = this.round;
    this.terrainRenderer.update(round.terrain);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    drawHud(ctx, round, {
      soundOn: this.app.settings.sound,
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
      this.set.settings.visibleShot,
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
        roundNumber: this.set.roundsPlayed + 1,
        totalRounds: this.set.totalRounds,
        soundOn: this.app.settings.sound,
        tickCount: this.round.tickCount,
        touch: this.app.screen.touch,
      });
    }

    this.app.debug.set(
      'round',
      `${this.set.roundsPlayed + 1}/${this.set.totalRounds} (${round.terrainStyle})`,
    );
    this.app.debug.set('phase', round.phase);
  }

  renderSides(ctx: CanvasRenderingContext2D): void {
    if (!this.touch) return;
    const enabled = this.round.phase === 'aiming' && this.isHumanTurn() && !this.overlay;
    drawTouchPanels(
      ctx,
      this.touch.layout,
      this.touch.pressed,
      this.round,
      enabled,
      this.app.screen.sideWidth,
      this.app.screen.width,
    );
  }

  dispose(): void {
    this.keyboard.dispose();
    this.pointer.dispose();
    this.touch?.dispose();
  }
}

function clampStep(delta: number, max: number): number {
  return Math.max(-max, Math.min(max, delta));
}
