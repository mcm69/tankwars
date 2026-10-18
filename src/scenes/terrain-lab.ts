import { LAYOUT } from '../config';
import { Rng } from '../core/rng';
import type { DebugOverlay } from '../render/debug-overlay';
import type { Screen } from '../render/screen';
import { renderSky, TerrainRenderer } from '../render/terrain-renderer';
import { THEMES, type TerrainTheme } from '../render/themes';
import type { Terrain } from '../sim/terrain';
import { generateTerrain, TERRAIN_STYLES, type TerrainStyle } from '../sim/terrain-gen';

/**
 * Stage 1 debug scene: generate terrains and carve/fill them by hand.
 *
 * R new seed · S cycle style · T cycle theme · [ ] brush size
 * Left-drag carves · right-drag (or Shift+left) fills · wheel also resizes the brush
 */
export class TerrainLab {
  private seed: number;
  private styleIndex = -1; // -1 = random per seed
  private themeIndex = -1;
  private style: TerrainStyle = 'rolling';
  private theme: TerrainTheme = THEMES[0]!;
  private terrain!: Terrain;
  private sky!: HTMLCanvasElement;
  private readonly renderer: TerrainRenderer;
  private brush = 16;
  private pointer: { x: number; y: number; mode: 'carve' | 'fill' | null } | null = null;

  constructor(
    private readonly screen: Screen,
    private readonly debug: DebugOverlay,
    seed: number,
  ) {
    this.seed = seed;
    this.renderer = new TerrainRenderer(LAYOUT.field.w, LAYOUT.field.h, this.theme);
    this.regenerate();
    this.bindInput();
  }

  regenerate(): void {
    const { w, h } = LAYOUT.field;
    const rng = new Rng(this.seed);
    const style = this.styleIndex >= 0 ? TERRAIN_STYLES[this.styleIndex] : undefined;
    const result = generateTerrain(rng, w, h, style ? { style } : {});
    this.terrain = result.terrain;
    this.style = result.style;
    // Presentation-only choice; uses its own stream so it never perturbs sim randomness.
    this.theme =
      this.themeIndex >= 0 ? THEMES[this.themeIndex]! : new Rng(this.seed ^ 0x5eed).pick(THEMES);
    this.renderer.setTheme(this.theme);
    this.sky = renderSky(w, h, this.theme);
  }

  update(): void {
    const p = this.pointer;
    if (p?.mode === 'carve') this.terrain.carveCircle(p.x, p.y, this.brush);
    else if (p?.mode === 'fill') this.terrain.fillCircle(p.x, p.y, this.brush);
  }

  render(): void {
    const { ctx } = this.screen;
    const { hud, field } = LAYOUT;
    this.renderer.update(this.terrain);

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.screen.width, this.screen.height);

    // HUD placeholder until Stage 4.
    ctx.fillStyle = '#1a1424';
    ctx.fillRect(hud.x, hud.y, hud.w, hud.h);
    ctx.fillStyle = '#8a7fa8';
    ctx.font = '12px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText('TERRAIN LAB   R: new  S: style  T: theme  [ ]: brush', 8, 8);
    ctx.fillText('drag: carve   right-drag / shift-drag: fill', 8, 26);

    ctx.drawImage(this.sky, field.x, field.y);
    ctx.drawImage(this.renderer.canvas, field.x, field.y);

    ctx.strokeStyle = '#c050ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(field.x - 0.5, field.y - 0.5, field.w + 1, field.h + 1);

    if (this.pointer) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(field.x, field.y, field.w, field.h);
      ctx.clip();
      ctx.strokeStyle = 'rgb(255 255 255 / 70%)';
      ctx.beginPath();
      ctx.arc(field.x + this.pointer.x, field.y + this.pointer.y, this.brush, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    this.debug.set('seed', this.seed);
    this.debug.set('style', this.styleIndex >= 0 ? this.style : `${this.style} (random)`);
    this.debug.set('theme', this.themeIndex >= 0 ? this.theme.name : `${this.theme.name} (random)`);
    this.debug.set('brush', this.brush);
  }

  private bindInput(): void {
    const canvas = this.screen.canvas;
    const toField = (e: PointerEvent) => {
      const p = this.screen.toLogical(e.clientX, e.clientY);
      return { x: p.x - LAYOUT.field.x, y: p.y - LAYOUT.field.y };
    };
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      const fill = e.button === 2 || e.shiftKey;
      this.pointer = { ...toField(e), mode: fill ? 'fill' : 'carve' };
      // Apply immediately so a quick click registers even between ticks.
      this.update();
    });
    canvas.addEventListener('pointermove', (e) => {
      this.pointer = { ...toField(e), mode: this.pointer?.mode ?? null };
    });
    const release = () => {
      if (this.pointer) this.pointer.mode = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('pointerleave', () => {
      if (!this.pointer?.mode) this.pointer = null;
    });
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.resizeBrush(e.deltaY < 0 ? 2 : -2);
      },
      { passive: false },
    );

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      switch (e.key.toLowerCase()) {
        case 'r':
          this.seed = (Math.random() * 2 ** 31) >>> 0; // UI-level reseed, not sim randomness
          this.regenerate();
          break;
        case 's':
          this.styleIndex = this.styleIndex + 1 >= TERRAIN_STYLES.length ? -1 : this.styleIndex + 1;
          this.regenerate();
          break;
        case 't':
          this.themeIndex = this.themeIndex + 1 >= THEMES.length ? -1 : this.themeIndex + 1;
          this.regenerate();
          break;
        case '[':
          this.resizeBrush(-2);
          break;
        case ']':
          this.resizeBrush(2);
          break;
      }
    });
  }

  private resizeBrush(delta: number): void {
    this.brush = Math.min(120, Math.max(2, this.brush + delta));
  }
}
