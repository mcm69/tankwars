import type { App } from '../app';
import { LOGICAL_WIDTH } from '../config';
import type { GameSet } from '../game/set';
import { UiInput } from '../input/ui-input';
import { drawText, drawTextShadow } from '../render/font';
import { PLAYER_COLORS, tankSprite } from '../render/tank-sprite';
import { backdrop, heading, panel, UI } from '../ui/widgets';
import type { Scene } from './scene';

/** Seconds before an all-computer set moves on by itself. */
const AUTO_ADVANCE_TICKS = 180;

/**
 * Standings between games ("status screen") and at the end of the set ("final results").
 * Any key or click continues.
 */
export class ResultsScene implements Scene {
  readonly name: string;
  private readonly input: UiInput;
  private ticks = 0;

  constructor(
    private readonly app: App,
    private readonly set: GameSet,
    private readonly final: boolean,
  ) {
    this.name = final ? 'final' : 'status';
    this.input = new UiInput(app.screen);
  }

  update(): void {
    this.ticks++;
    // Ignore input for a moment so the key that ended the round doesn't skip this screen.
    const events = this.input.poll();
    if (this.ticks < 20) return;
    const proceed =
      events.some((e) => (e.type === 'key' && !e.repeat) || e.type === 'click') ||
      (this.set.allComputers && !this.final && this.ticks > AUTO_ADVANCE_TICKS);
    if (!proceed) return;
    this.app.audio.ui('select');
    if (this.final) this.app.showMenu();
    else this.app.afterStatus();
  }

  render(): void {
    const { ctx } = this.app.screen;
    const set = this.set;
    backdrop(ctx);
    heading(
      ctx,
      this.final ? 'FINAL RESULTS' : `GAME ${set.roundsPlayed} OF ${set.totalRounds}`,
      10,
    );

    const standings = set.standings();
    const winner = set.lastWinner === null ? null : set.players[set.lastWinner]!;
    if (this.final) {
      const champ = standings[0]!;
      drawTextShadow(
        ctx,
        `${champ.name} wins the set!`,
        LOGICAL_WIDTH / 2,
        44,
        PLAYER_COLORS[champ.color]!,
        2,
        'center',
      );
    } else {
      const text = winner ? `${winner.name} won this game` : 'Nobody survived this game';
      drawText(
        ctx,
        text,
        LOGICAL_WIDTH / 2,
        46,
        winner ? PLAYER_COLORS[winner.color]! : UI.text,
        2,
        'center',
      );
    }

    const rowH = 22;
    const r = { x: 90, y: 72, w: 460, h: 34 + standings.length * rowH };
    panel(ctx, r);
    const cols = {
      rank: r.x + 14,
      name: r.x + 50,
      score: r.x + 250,
      gain: r.x + 290,
      money: r.x + 358,
      wins: r.x + 400,
      kills: r.x + 444,
    };
    drawText(ctx, '#', cols.rank, r.y + 10, UI.label);
    drawText(ctx, 'Player', cols.name, r.y + 10, UI.label);
    drawText(ctx, 'Score', cols.score, r.y + 10, UI.label, 1, 'right');
    drawText(ctx, 'Money', cols.money, r.y + 10, UI.label, 1, 'right');
    drawText(ctx, 'Wins', cols.wins, r.y + 10, UI.label, 1, 'right');
    drawText(ctx, 'Kills', cols.kills, r.y + 10, UI.label, 1, 'right');
    standings.forEach((p, i) => {
      const y = r.y + 28 + i * rowH;
      const color = PLAYER_COLORS[p.color]!;
      drawText(ctx, String(i + 1), cols.rank, y + 4, UI.text);
      ctx.drawImage(tankSprite(color), cols.name - 22, y + 3);
      drawText(ctx, p.name, cols.name, y, color, 2);
      drawText(ctx, String(p.score), cols.score, y + 4, UI.value, 1, 'right');
      const gain = set.lastRoundScores[p.index] ?? 0;
      if (!this.final && gain !== 0) {
        drawText(
          ctx,
          `${gain > 0 ? '+' : ''}${gain}`,
          cols.gain,
          y + 4,
          gain > 0 ? '#7dff9a' : '#ff6a6a',
          1,
          'right',
        );
      }
      drawText(ctx, `$${p.money}`, cols.money, y + 4, '#7dff9a', 1, 'right');
      drawText(ctx, String(p.wins), cols.wins, y + 4, UI.text, 1, 'right');
      drawText(ctx, String(p.kills), cols.kills, y + 4, UI.text, 1, 'right');
    });

    if (this.ticks >= 20 && Math.floor(this.ticks / 30) % 2 === 0) {
      const msg = this.final ? 'Press any key for the main menu' : 'Press any key to continue';
      drawText(ctx, msg, LOGICAL_WIDTH / 2, 380, UI.text, 1, 'center');
    }
  }

  dispose(): void {
    this.input.dispose();
  }
}
