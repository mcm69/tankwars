/** Crisp pixel-art drawing helpers (canvas arcs/lines are anti-aliased; these are not). */

export function fillPixelCircle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
): void {
  const x0 = Math.round(cx);
  const y0 = Math.round(cy);
  const ri = Math.round(r);
  for (let dy = -ri; dy <= ri; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(x0 - half, y0 + dy, half * 2 + 1, 1);
  }
}

/** Thick line made of square dots, for barrels and beams. */
export function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness = 2,
): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len * 2));
  const off = Math.floor(thickness / 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ctx.fillRect(
      Math.round(x0 + (x1 - x0) * t) - off,
      Math.round(y0 + (y1 - y0) * t) - off,
      thickness,
      thickness,
    );
  }
}
