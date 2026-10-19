import type { Settings } from '../game/settings';

/** Whether the OS asks for reduced motion (false outside a browser). */
export function systemPrefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Reduced motion stills the background, turns off screen shake and tones down full-field
 * flashes. "Auto" follows the system setting.
 */
export function motionReduced(
  s: Pick<Settings, 'motion'>,
  system = systemPrefersReducedMotion(),
): boolean {
  return s.motion === 'reduced' || (s.motion === 'auto' && system);
}

/** Effective background speed after the reduced-motion preference. */
export function effectiveBackgroundSpeed(
  s: Pick<Settings, 'motion' | 'backgroundSpeed'>,
  system?: boolean,
): number {
  return motionReduced(s, system) ? 0 : s.backgroundSpeed;
}

/** Most shake (in pixels) any single event adds, and the decay per tick. */
const MAX_SHAKE = 6;
const SHAKE_DECAY = 0.86;

/**
 * Screen shake: kicks add trauma that decays each tick, and the offset is a jitter scaled by
 * it. Presentation only; uses its own tiny PRNG so it never touches the sim.
 */
export class Shake {
  private amount = 0;
  private seed = 0x9e3779b9;
  x = 0;
  y = 0;

  kick(pixels: number): void {
    this.amount = Math.min(MAX_SHAKE, Math.max(this.amount, pixels));
  }

  tick(): void {
    this.amount *= SHAKE_DECAY;
    if (this.amount < 0.3) {
      this.amount = 0;
      this.x = this.y = 0;
      return;
    }
    // Mostly vertical and never upward, so the field's bottom edge never shows sky under it.
    this.x = Math.round((this.rand() * 2 - 1) * this.amount * 0.5);
    this.y = Math.round(this.rand() * this.amount);
  }

  reset(): void {
    this.amount = this.x = this.y = 0;
  }

  private rand(): number {
    // xorshift32
    let s = this.seed;
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    this.seed = s >>> 0;
    return this.seed / 4294967296;
  }
}

/** Shake for an explosion of this radius: small shots barely nudge, nukes rattle. */
export function shakeForRadius(radius: number): number {
  return radius < 12 ? 0 : Math.min(MAX_SHAKE, (radius - 8) / 10);
}
