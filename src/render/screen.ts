/**
 * Owns the game canvas: a fixed logical resolution scaled to the viewport with
 * nearest-neighbor filtering and letterboxing.
 */

/**
 * CSS-pixel scale for the logical canvas. Prefers an integer scale in *device* pixels
 * (perfectly crisp), falling back to a fractional fit when the viewport is smaller
 * than the logical size.
 */
export function computeScale(
  viewportW: number,
  viewportH: number,
  dpr: number,
  logicalW: number,
  logicalH: number,
): number {
  const fit = Math.min(viewportW / logicalW, viewportH / logicalH);
  const deviceInt = Math.floor(fit * dpr);
  return deviceInt >= 1 ? deviceInt / dpr : fit;
}

export class Screen {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private scale = 1;

  constructor(
    container: HTMLElement,
    readonly width: number,
    readonly height: number,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.className = 'game-canvas';
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.scale = computeScale(
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio || 1,
      this.width,
      this.height,
    );
    this.canvas.style.width = `${this.width * this.scale}px`;
    this.canvas.style.height = `${this.height * this.scale}px`;
  }

  /** Converts a client (CSS pixel) coordinate to a logical canvas coordinate. */
  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * this.width,
      y: ((clientY - rect.top) / rect.height) * this.height,
    };
  }
}
