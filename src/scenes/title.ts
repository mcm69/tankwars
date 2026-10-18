import type { App } from '../app';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../config';
import { Rng } from '../core/rng';
import { UiInput } from '../input/ui-input';
import { drawText, drawTextShadow } from '../render/font';
import { drawPixelLine, fillPixelCircle } from '../render/pixels';
import { lighten, tankSprite } from '../render/tank-sprite';
import { renderSky, TerrainRenderer } from '../render/terrain-renderer';
import { THEMES } from '../render/themes';
import { stepProjectile, type Projectile } from '../sim/physics';
import type { Terrain } from '../sim/terrain';
import { generateTerrain } from '../sim/terrain-gen';
import type { Scene } from './scene';

const TANK_SCALE = 3;
const FIRE_COLORS = ['#ffffff', '#fff27a', '#ffc23a', '#ff7a1a', '#e0321e', '#9a1a14'];

interface Boom {
  x: number;
  y: number;
  r: number;
  age: number;
}

/**
 * Title screen: big pixel logo over a sunset battlefield, with a tank lobbing shells at the
 * far hills as an attract animation. Any key or click continues to the main menu.
 */
export class TitleScene implements Scene {
  readonly name = 'title';
  private readonly input: UiInput;
  private readonly terrain: Terrain;
  private readonly terrainRenderer: TerrainRenderer;
  private readonly sky: HTMLCanvasElement;
  private readonly rng = new Rng(1990);
  private readonly tank = { x: 80, y: 0, angle: 38 };
  private shell: Projectile | null = null;
  private booms: Boom[] = [];
  private ticks = 0;

  constructor(private readonly app: App) {
    this.input = new UiInput(app.screen);
    const gen = generateTerrain(new Rng(1991), LOGICAL_WIDTH, LOGICAL_HEIGHT, {
      style: 'rolling',
      minSurface: 0.62,
      maxSurface: 0.9,
    });
    this.terrain = gen.terrain;
    const theme = THEMES.find((t) => t.name === 'desert')!;
    this.sky = renderSky(LOGICAL_WIDTH, LOGICAL_HEIGHT, theme);
    this.terrainRenderer = new TerrainRenderer(LOGICAL_WIDTH, LOGICAL_HEIGHT, theme);
    // Level a pad for the tank.
    this.tank.y = this.terrain.surfaceY(this.tank.x);
    for (let x = this.tank.x - 26; x <= this.tank.x + 26; x++) {
      for (let y = 0; y < LOGICAL_HEIGHT; y++) this.terrain.set(x, y, y >= this.tank.y ? 1 : 0);
    }
  }

  update(): void {
    for (const e of this.input.poll()) {
      if (e.type === 'key' || e.type === 'click') {
        this.app.audio.ui('select');
        this.app.showMenu();
        return;
      }
    }
    this.ticks++;
    if (!this.shell && this.ticks % 110 === 40) this.fire();
    if (this.shell) {
      const r = stepProjectile(this.shell, {
        terrain: this.terrain,
        tanks: [],
        wind: 0,
        walls: false,
      });
      if (r.kind === 'hitTerrain') {
        this.terrain.carveCircle(r.x, r.y, 14);
        this.app.audio.roundEvent({ type: 'explode', x: r.x, y: r.y, radius: 14, harmless: false });
        this.booms.push({ x: r.x, y: r.y, r: 14, age: 0 });
        this.shell = null;
      } else if (r.kind !== 'flying') {
        this.shell = null;
      }
    }
    for (const b of this.booms) b.age++;
    this.booms = this.booms.filter((b) => b.age < 28);
  }

  private fire(): void {
    const a = (this.tank.angle * Math.PI) / 180;
    const tip = this.barrelTip();
    const speed = this.rng.range(5.2, 6.6);
    this.shell = {
      x: tip.x,
      y: tip.y,
      prevX: tip.x,
      prevY: tip.y,
      vx: Math.cos(a) * speed,
      vy: -Math.sin(a) * speed,
      ownerId: -1,
      weapon: 1,
      passed: [],
      age: 0,
    };
    this.booms.push({ x: tip.x, y: tip.y, r: 5, age: 10 }); // muzzle flash
    this.app.audio.roundEvent({ type: 'fire', tankId: -1, weapon: 1 });
  }

  private barrelTip() {
    const a = (this.tank.angle * Math.PI) / 180;
    const len = 10 * TANK_SCALE;
    return {
      x: this.tank.x + Math.cos(a) * len,
      y: this.tank.y - 6 * TANK_SCALE - Math.sin(a) * len,
    };
  }

  render(alpha: number): void {
    const { ctx } = this.app.screen;
    this.terrainRenderer.update(this.terrain);
    ctx.drawImage(this.sky, 0, 0);
    ctx.drawImage(this.terrainRenderer.canvas, 0, 0);

    // The tank, drawn big.
    const tip = this.barrelTip();
    ctx.fillStyle = lighten('#7ac8a0', 0.2);
    drawPixelLine(ctx, this.tank.x, this.tank.y - 6 * TANK_SCALE, tip.x, tip.y, TANK_SCALE * 2);
    const sprite = tankSprite('#7ac8a0');
    ctx.drawImage(
      sprite,
      this.tank.x - (sprite.width * TANK_SCALE) / 2,
      this.tank.y - sprite.height * TANK_SCALE,
      sprite.width * TANK_SCALE,
      sprite.height * TANK_SCALE,
    );

    const s = this.shell;
    if (s) {
      const x = s.prevX + (s.x - s.prevX) * alpha;
      const y = s.prevY + (s.y - s.prevY) * alpha;
      ctx.fillStyle = '#fff6c0';
      fillPixelCircle(ctx, x, y, 2);
    }
    for (const b of this.booms) {
      const k = b.age / 28;
      ctx.fillStyle = FIRE_COLORS[Math.min(5, Math.floor(k * 6) + 1)]!;
      fillPixelCircle(ctx, b.x, b.y, b.r * Math.min(1, (b.age + 1) / 5) * (1 - k * 0.4));
      ctx.fillStyle = FIRE_COLORS[Math.min(5, Math.floor(k * 6))]!;
      fillPixelCircle(ctx, b.x, b.y, b.r * 0.55);
    }

    // Logo: chunky outlined letters with a deep shadow.
    const cx = LOGICAL_WIDTH / 2;
    for (const [dx, dy] of [
      [-2, 0],
      [2, 0],
      [0, -2],
      [0, 2],
    ] as const) {
      drawText(ctx, 'TANK WARS', cx + dx, 54 + dy, '#3a0a1a', 8, 'center');
    }
    drawText(ctx, 'TANK WARS', cx + 6, 60, '#1a0a20', 8, 'center');
    drawText(ctx, 'TANK WARS', cx, 54, '#ffd23a', 8, 'center');
    // Lower half of each letter in a hotter color for a two-tone look.
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 54 + 28, LOGICAL_WIDTH, 28);
    ctx.clip();
    drawText(ctx, 'TANK WARS', cx, 54, '#ff7a2a', 8, 'center');
    ctx.restore();

    drawTextShadow(
      ctx,
      'A remake of the 1990 shareware classic by Kenny Morse',
      cx,
      124,
      '#fff0d0',
      1,
      'center',
    );
    if (Math.floor(this.ticks / 30) % 2 === 0) {
      drawTextShadow(ctx, 'Press any key', cx, 150, '#ffffff', 2, 'center');
    }
  }

  dispose(): void {
    this.input.dispose();
  }
}
