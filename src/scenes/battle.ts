import { LAYOUT } from '../config';
import { Rng } from '../core/rng';
import { KeyboardController } from '../input/keyboard';
import { BattleRenderer } from '../render/battle-renderer';
import type { DebugOverlay } from '../render/debug-overlay';
import type { Screen } from '../render/screen';
import { renderSky, TerrainRenderer } from '../render/terrain-renderer';
import { THEMES } from '../render/themes';
import { Round, type PlayerSetup } from '../sim/round';

/** Stage 2 battle: hot-seat players on one keyboard, endless rounds. */
export class BattleScene {
  private round!: Round;
  private roundNumber = 0;
  private sky!: HTMLCanvasElement;
  private terrainRenderer!: TerrainRenderer;
  private readonly renderer = new BattleRenderer();
  private readonly keyboard = new KeyboardController();

  constructor(
    private readonly screen: Screen,
    private readonly debug: DebugOverlay,
    private readonly seed: number,
    private readonly players: readonly PlayerSetup[],
  ) {
    this.newRound();
  }

  /** Read-only view for tests and debugging. */
  get state(): Round {
    return this.round;
  }

  private newRound(): void {
    const seed = (this.seed + this.roundNumber * 0x9e3779b1) >>> 0;
    this.roundNumber++;
    this.round = new Round({ seed, players: this.players });
    const theme = new Rng(seed ^ 0x5eed).pick(THEMES);
    const { w, h } = LAYOUT.field;
    this.sky = renderSky(w, h, theme);
    this.terrainRenderer = new TerrainRenderer(w, h, theme);
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
    ctx.drawImage(this.terrainRenderer.canvas, 0, 0);
    this.renderer.drawField(ctx, round, alpha);
    ctx.restore();

    ctx.strokeStyle = '#c050ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(field.x - 0.5, field.y - 0.5, field.w + 1, field.h + 1);
    this.renderer.drawRoundOver(ctx, round);

    this.debug.set('round', `${this.roundNumber} (${round.terrainStyle})`);
    this.debug.set('phase', round.phase);
  }
}
