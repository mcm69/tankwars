import { drawPixelLine } from './pixels';

/**
 * Persistent shot trails for the current round, drawn between the sky and the terrain.
 * Segments are added once per sim tick, so the layer never needs a full redraw.
 */
export class TrailLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;

  constructor(width: number, height: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = width;
    this.canvas.height = height;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    this.ctx = ctx;
  }

  segment(x0: number, y0: number, x1: number, y1: number, color: string): void {
    // A wall bounce makes one tick's segment jump across the field; skip those.
    if (Math.abs(x1 - x0) > this.canvas.width / 2) return;
    this.ctx.fillStyle = color;
    drawPixelLine(this.ctx, x0, y0, x1, y1, 1);
  }

  clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
