/**
 * Owns the game canvas: a logical resolution scaled to the viewport with nearest-neighbor
 * filtering and letterboxing.
 *
 * The game draws in a fixed 640×400 "core". On touch devices the canvas is widened to the
 * device's aspect (at least 800 px, so there's room), and the core sits in the middle with side
 * panels for big touch controls. Everything except those panels works in core coordinates.
 */

export const CORE_WIDTH = 640;
export const CORE_HEIGHT = 400;
/** Touch layout canvas width range (logical px). Narrower devices letterbox vertically. */
export const TOUCH_MIN_WIDTH = 800;
export const TOUCH_MAX_WIDTH = 960;

/**
 * CSS-pixel scale for the logical canvas. By default prefers an integer scale in *device*
 * pixels (perfectly crisp), falling back to a fractional fit when the viewport is smaller
 * than the logical size. With `preferInteger` off (phones, where every pixel of screen counts)
 * it always fills the viewport.
 */
export function computeScale(
  viewportW: number,
  viewportH: number,
  dpr: number,
  logicalW: number,
  logicalH: number,
  preferInteger = true,
): number {
  const fit = Math.min(viewportW / logicalW, viewportH / logicalH);
  if (!preferInteger) return fit;
  const deviceInt = Math.floor(fit * dpr);
  return deviceInt >= 1 ? deviceInt / dpr : fit;
}

/** Canvas width for the touch layout on a viewport of this size (even, clamped). */
export function touchCanvasWidth(viewportW: number, viewportH: number): number {
  const ideal = Math.round((CORE_HEIGHT * viewportW) / Math.max(1, viewportH));
  const w = Math.min(TOUCH_MAX_WIDTH, Math.max(TOUCH_MIN_WIDTH, ideal));
  return w - (w % 2);
}

export class Screen {
  readonly canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  readonly height = CORE_HEIGHT;
  /** Current canvas width: 640, or wider in the touch layout. */
  width = CORE_WIDTH;
  /** Left edge of the core area within the canvas. */
  coreOffsetX = 0;
  private scale = 1;

  constructor(
    container: HTMLElement,
    /** Whether to use the touch layout (side panels). */
    readonly touch: boolean,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'game-canvas';
    container.appendChild(this.canvas);
    const ctx = this.canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // The canvas never needs focus; not taking it keeps on-screen text fields focused when
    // a tap's emulated mouse events arrive (which would otherwise close the soft keyboard).
    this.canvas.addEventListener('mousedown', (e) => e.preventDefault());
  }

  /** Width of each side panel in the touch layout (0 on desktop). */
  get sideWidth(): number {
    return this.coreOffsetX;
  }

  resize(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const width = this.touch ? touchCanvasWidth(vw, vh) : CORE_WIDTH;
    if (width !== this.canvas.width || this.canvas.height !== CORE_HEIGHT) {
      this.canvas.width = width;
      this.canvas.height = CORE_HEIGHT;
      this.ctx.imageSmoothingEnabled = false; // resizing resets context state
    }
    this.width = width;
    this.coreOffsetX = (width - CORE_WIDTH) / 2;
    const dpr = window.devicePixelRatio || 1;
    this.scale = computeScale(vw, vh, dpr, width, CORE_HEIGHT, !this.touch);
    this.canvas.style.width = `${width * this.scale}px`;
    this.canvas.style.height = `${CORE_HEIGHT * this.scale}px`;
  }

  /** Converts a client (CSS pixel) coordinate to whole-canvas logical coordinates. */
  toCanvas(clientX: number, clientY: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * this.width,
      y: ((clientY - rect.top) / rect.height) * this.height,
    };
  }

  /** Converts a client coordinate to core (640×400) logical coordinates. */
  toLogical(clientX: number, clientY: number): { x: number; y: number } {
    const p = this.toCanvas(clientX, clientY);
    return { x: p.x - this.coreOffsetX, y: p.y };
  }

  /** Whether a core-coordinate point lies inside the core area. */
  inCore(x: number, y: number): boolean {
    return x >= 0 && x < CORE_WIDTH && y >= 0 && y < CORE_HEIGHT;
  }
}
