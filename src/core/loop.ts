/**
 * Fixed-timestep accumulator. Pure (no timers), so it can be unit-tested and reused
 * by headless runners. Feed it elapsed wall time; it says how many sim ticks to run and
 * how far between the last two ticks the renderer should interpolate.
 */
export class FixedStepper {
  readonly stepMs: number;
  /** Elapsed time beyond this is dropped, so a stalled tab doesn't trigger a catch-up storm. */
  readonly maxFrameMs: number;
  private accumulator = 0;

  constructor(tickRate: number, maxFrameMs = 250) {
    this.stepMs = 1000 / tickRate;
    this.maxFrameMs = maxFrameMs;
  }

  advance(elapsedMs: number): { ticks: number; alpha: number } {
    this.accumulator += Math.min(Math.max(elapsedMs, 0), this.maxFrameMs);
    let ticks = 0;
    while (this.accumulator >= this.stepMs) {
      this.accumulator -= this.stepMs;
      ticks++;
    }
    return { ticks, alpha: this.accumulator / this.stepMs };
  }

  reset(): void {
    this.accumulator = 0;
  }
}

export interface LoopHandlers {
  /** Advance the simulation by exactly one tick. */
  update(): void;
  /** Draw; `alpha` in [0,1) is the interpolation factor between the previous and current tick. */
  render(alpha: number): void;
}

/** Drives a FixedStepper from requestAnimationFrame. */
export class GameLoop {
  private readonly stepper: FixedStepper;
  private rafId = 0;
  private last = 0;
  private running = false;

  constructor(
    tickRate: number,
    private readonly handlers: LoopHandlers,
  ) {
    this.stepper = new FixedStepper(tickRate);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.stepper.reset();
    this.last = performance.now();
    const frame = (now: number) => {
      const { ticks, alpha } = this.stepper.advance(now - this.last);
      this.last = now;
      // A handler may stop the loop (e.g. the error boundary); honor it mid-frame.
      for (let i = 0; i < ticks && this.running; i++) this.handlers.update();
      if (this.running) this.handlers.render(alpha);
      if (this.running) this.rafId = requestAnimationFrame(frame);
    };
    this.rafId = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }
}
