import { Rng } from '../core/rng';

/**
 * Stage 0 placeholder scene: a static pattern that makes scaling artifacts obvious, plus a
 * bouncing ball stepped by the fixed-tick sim and drawn with interpolation.
 */
export class TestPattern {
  private x = 40;
  private y = 60;
  private vx = 3;
  private vy = 0;
  private prevX = this.x;
  private prevY = this.y;
  private readonly background: HTMLCanvasElement;
  private readonly radius = 8;

  constructor(
    private readonly width: number,
    private readonly height: number,
    seed: number,
  ) {
    this.background = this.drawBackground(new Rng(seed));
  }

  update(): void {
    this.prevX = this.x;
    this.prevY = this.y;
    this.vy += 0.25;
    this.x += this.vx;
    this.y += this.vy;
    const r = this.radius;
    if (this.x < r || this.x > this.width - r) {
      this.vx = -this.vx;
      this.x = Math.min(Math.max(this.x, r), this.width - r);
    }
    if (this.y > this.height - r - 4) {
      this.y = this.height - r - 4;
      this.vy = -11;
    }
  }

  render(ctx: CanvasRenderingContext2D, alpha: number): void {
    ctx.drawImage(this.background, 0, 0);
    const x = Math.round(this.prevX + (this.x - this.prevX) * alpha);
    const y = Math.round(this.prevY + (this.y - this.prevY) * alpha);
    ctx.fillStyle = '#ffec27';
    ctx.beginPath();
    ctx.arc(x, y, this.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawBackground(rng: Rng): HTMLCanvasElement {
    const { width: w, height: h } = this;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');

    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, w, h);

    // 1-px checkerboard strip: shimmers visibly if scaling is not crisp.
    for (let y = 0; y < 16; y++) {
      for (let x = y & 1; x < w; x += 2) {
        ctx.fillStyle = '#ccc';
        ctx.fillRect(x, 8 + y, 1, 1);
      }
    }

    // 8-px grid.
    ctx.fillStyle = '#222';
    for (let x = 0; x < w; x += 8) ctx.fillRect(x, 32, 1, h - 32);
    for (let y = 32; y < h; y += 8) ctx.fillRect(0, y, w, 1);

    // Color bars.
    const bars = ['#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8'];
    const barW = Math.floor(w / bars.length);
    bars.forEach((c, i) => {
      ctx.fillStyle = c;
      ctx.fillRect(i * barW, 40, barW, 24);
    });

    // Seeded random hills, proving the RNG drives visuals deterministically.
    ctx.fillStyle = '#3a7d2c';
    let hy = h * 0.75;
    for (let x = 0; x < w; x++) {
      hy = Math.min(Math.max(hy + rng.range(-1.5, 1.5), h * 0.55), h - 20);
      ctx.fillRect(x, Math.round(hy), 1, h - Math.round(hy));
    }

    // Border, 1 px inside the edge.
    ctx.strokeStyle = '#c050ff';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);

    ctx.fillStyle = '#fff';
    ctx.font = '16px monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(`TANK WARS — Stage 0 test pattern (${w}x${h})`, 8, 72);
    return canvas;
  }
}
