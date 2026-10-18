import { LAYOUT } from '../config';
import { Rng } from '../core/rng';
import { KeyboardController } from '../input/keyboard';
import { BattleRenderer } from '../render/battle-renderer';
import type { DebugOverlay } from '../render/debug-overlay';
import type { Screen } from '../render/screen';
import { darken, PLAYER_COLORS } from '../render/tank-sprite';
import { renderSky, TerrainRenderer } from '../render/terrain-renderer';
import { THEMES } from '../render/themes';
import { TrailLayer } from '../render/trail-layer';
import { DEFAULT_OPTIONS, type GameOptions } from '../sim/options';
import { Round, type PlayerSetup } from '../sim/round';
import { DevOptionsPanel } from '../ui/dev-options';

/** Hot-seat battle on one keyboard, endless rounds. */
export class BattleScene {
  private round!: Round;
  private roundNumber = 0;
  private sky!: HTMLCanvasElement;
  private terrainRenderer!: TerrainRenderer;
  private readonly trails = new TrailLayer(LAYOUT.field.w, LAYOUT.field.h);
  private readonly renderer = new BattleRenderer();
  private readonly keyboard = new KeyboardController();
  private options: GameOptions;

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
    this.newRound();
  }

  /** Read-only view for tests and debugging. */
  get state(): Round {
    return this.round;
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

  update(): void {
    const commands = this.keyboard.poll();
    if (this.round.phase === 'roundOver') {
      if (commands.some((c) => c.type === 'fire')) this.newRound();
    } else {
      for (const c of commands) this.round.command(c);
    }
    this.round.tick();
    this.renderer.onEvents(this.round, this.round.drainEvents());
    this.renderer.tick();

    const p = this.round.projectile;
    if (p && this.options.shotTrail) {
      const owner = this.round.tanks[p.ownerId]!;
      this.trails.segment(p.prevX, p.prevY, p.x, p.y, darken(PLAYER_COLORS[owner.color]!, 0.35));
    }
  }

  render(alpha: number): void {
    const { ctx } = this.screen;
    const { field } = LAYOUT;
    const round = this.round;
    this.terrainRenderer.update(round.terrain);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.screen.width, this.screen.height);
    this.renderer.drawHud(ctx, round);

    ctx.save();
    ctx.beginPath();
    ctx.rect(field.x, field.y, field.w, field.h);
    ctx.clip();
    ctx.translate(field.x, field.y);
    ctx.drawImage(this.sky, 0, 0);
    ctx.drawImage(this.trails.canvas, 0, 0);
    ctx.drawImage(this.terrainRenderer.canvas, 0, 0);
    this.renderer.drawField(ctx, round, alpha, this.options.visibleShot);
    ctx.restore();

    ctx.strokeStyle = round.walls ? '#e040ff' : '#7a3aa0';
    ctx.lineWidth = 1;
    ctx.strokeRect(field.x - 0.5, field.y - 0.5, field.w + 1, field.h + 1);
    this.renderer.drawRoundOver(ctx, round);

    this.debug.set('round', `${this.roundNumber} (${round.terrainStyle})`);
    this.debug.set('phase', round.phase);
  }
}
