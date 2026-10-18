import { behaviorOf } from '../sim/weapons';
import type { RoundEvent } from '../sim/world';
import type { SoundOut, Voice } from './synth';

export type UiSound = 'move' | 'change' | 'select' | 'back' | 'purchase' | 'error';

export interface AudioSettings {
  sound: boolean;
  flySound: boolean;
  /** 0–10. */
  volume: number;
}

/** Same-kind sounds closer together than this (ms) are dropped, so debris doesn't roar. */
const THROTTLE_MS = 45;

/**
 * The game's sound effects, as recipes for the synth. Reads the settings on every call, so
 * toggling sound or volume takes effect immediately.
 */
export class Sfx {
  /** Count of sounds started (for tests and debugging). */
  played = 0;
  private readonly last = new Map<string, number>();
  private fly: Voice | null = null;

  constructor(
    private readonly out: SoundOut,
    private readonly settings: () => AudioSettings,
    private readonly now: () => number = () => performance.now(),
  ) {}

  private get on(): boolean {
    const s = this.settings();
    this.out.setVolume(s.volume / 10);
    return s.sound && s.volume > 0;
  }

  /** Runs a recipe unless sound is off or the same kind just played. */
  private play(kind: string, recipe: (o: SoundOut) => void, throttle = THROTTLE_MS): void {
    if (!this.on) return;
    const t = this.now();
    if (t - (this.last.get(kind) ?? -Infinity) < throttle) return;
    this.last.set(kind, t);
    this.played++;
    recipe(this.out);
  }

  roundEvent(e: RoundEvent): void {
    switch (e.type) {
      case 'turn':
        return this.play('turn', (o) =>
          o.tone({ wave: 'square', freq: 660, dur: 0.05, vol: 0.06 }),
        );
      case 'fire': {
        const kind = behaviorOf(e.weapon).kind;
        if (kind === 'laser') return; // the 'laser' event has its own sound
        return this.play('fire', (o) => {
          o.tone({ wave: 'square', freq: 520, to: 110, dur: 0.14, vol: 0.18 });
          o.noise({ dur: 0.12, vol: 0.25, freq: 3000, to: 400 });
        });
      }
      case 'fireRejected':
        return this.ui('error');
      case 'explode':
        if (e.harmless) {
          return this.play('puff', (o) => o.noise({ dur: 0.08, vol: 0.12, freq: 1500, to: 600 }));
        }
        return this.play(`explode${e.radius > 50 ? 'Big' : ''}`, (o) => explosion(o, e.radius));
      case 'laser':
        return this.play('laser', (o) => {
          o.tone({ wave: 'sawtooth', freq: 2400, to: 180, dur: 0.4, vol: 0.16 });
          o.tone({ wave: 'square', freq: 1800, to: 120, dur: 0.35, vol: 0.08, delay: 0.02 });
        });
      case 'reaction':
        // Geiger-counter crackle.
        return this.play('reaction', (o) => {
          for (let i = 0; i < 24; i++) {
            o.noise({
              dur: 0.02,
              vol: 0.18,
              delay: i * 0.05 + (i % 3) * 0.013,
              filter: 'bandpass',
              freq: 3500,
              q: 4,
            });
          }
        });
      case 'sonic':
        return this.play('sonic', (o) => {
          o.tone({ wave: 'sine', freq: 2900, to: 3600, dur: 0.9, vol: 0.12 });
          o.tone({ wave: 'sine', freq: 3050, to: 3400, dur: 0.9, vol: 0.08 });
        });
      case 'dirt':
        return this.play('dirt', (o) => o.noise({ dur: 0.3, vol: 0.35, freq: 400, to: 90 }));
      case 'crumble':
        return this.play(
          'crumble',
          (o) => o.noise({ dur: 1.2, vol: 0.25, freq: 260, to: 60 }),
          500,
        );
      case 'dud':
        return this.play('dud', (o) => {
          o.tone({ wave: 'square', freq: 880, dur: 0.06, vol: 0.15 });
          o.tone({ wave: 'square', freq: 1320, dur: 0.08, vol: 0.12, delay: 0.06 });
        });
      case 'tankHit':
        return this.play(
          'hit',
          (o) => o.tone({ wave: 'square', freq: 240, to: 90, dur: 0.12, vol: 0.14 }),
          80,
        );
      case 'shieldHit':
        return this.play(
          'shield',
          (o) => {
            o.tone({ wave: 'sine', freq: 1200, to: 1700, dur: 0.22, vol: 0.14 });
            o.tone({ wave: 'sine', freq: 1800, to: 2400, dur: 0.18, vol: 0.06, delay: 0.03 });
          },
          120,
        );
      case 'tankDied':
        return this.play('died', (o) => {
          if (e.style === 'meltdown') {
            for (let i = 0; i < 6; i++)
              o.tone({
                wave: 'square',
                freq: 700,
                to: 1100,
                dur: 0.12,
                vol: 0.12,
                delay: i * 0.16,
              });
          } else if (e.style === 'fade') {
            o.tone({ wave: 'sine', freq: 600, to: 80, dur: 0.9, vol: 0.14 });
          } else {
            [440, 330, 247, 165].forEach((f, i) =>
              o.tone({ wave: 'square', freq: f, dur: 0.1, vol: 0.12, delay: i * 0.09 }),
            );
          }
        });
      case 'roundOver':
        return this.play('roundOver', (o) => {
          const notes = e.winnerId === null ? [392, 330, 262, 196] : [523, 659, 784, 1047];
          notes.forEach((f, i) =>
            o.tone({
              wave: 'square',
              freq: f,
              dur: i === 3 ? 0.35 : 0.14,
              vol: 0.12,
              delay: i * 0.13,
            }),
          );
        });
      default: {
        // Every sim event must have a sound: adding one without a case is a compile error.
        const unhandled: never = e;
        return unhandled;
      }
    }
  }

  ui(kind: UiSound): void {
    this.play(
      `ui-${kind}`,
      (o) => {
        switch (kind) {
          case 'move':
            return o.tone({ wave: 'square', freq: 520, dur: 0.03, vol: 0.06 });
          case 'change':
            return o.tone({ wave: 'square', freq: 780, dur: 0.04, vol: 0.07 });
          case 'select':
            o.tone({ wave: 'square', freq: 660, dur: 0.06, vol: 0.09 });
            return o.tone({ wave: 'square', freq: 990, dur: 0.08, vol: 0.09, delay: 0.06 });
          case 'back':
            return o.tone({ wave: 'square', freq: 440, to: 300, dur: 0.08, vol: 0.08 });
          case 'purchase':
            o.tone({ wave: 'square', freq: 988, dur: 0.07, vol: 0.1 });
            return o.tone({ wave: 'square', freq: 1319, dur: 0.18, vol: 0.1, delay: 0.07 });
          case 'error':
            return o.tone({ wave: 'square', freq: 140, dur: 0.18, vol: 0.12 });
        }
      },
      25,
    );
  }

  /**
   * Fly sound: a whistle that follows the shell (higher up = higher pitch). Call every frame
   * with the shell's height above the field floor, or null when nothing is flying.
   */
  flying(height: number | null): void {
    const s = this.settings();
    if (height === null || !s.sound || !s.flySound || s.volume === 0) {
      this.fly?.stop();
      this.fly = null;
      return;
    }
    const pitch = 300 + Math.max(0, height) * 3;
    if (!this.fly) {
      this.fly = this.out.voice('triangle', pitch, 0.06);
      if (this.fly) this.played++;
    }
    this.fly?.setPitch(pitch);
  }

  /** Silences anything sustained (leaving a scene). */
  stopAll(): void {
    this.flying(null);
  }
}

/** Filtered-noise boom, longer, deeper and louder for bigger blasts, with a thump for nukes. */
function explosion(o: SoundOut, radius: number): void {
  const k = Math.min(1, radius / 115);
  o.noise({ dur: 0.3 + k * 1.4, vol: 0.3 + k * 0.3, freq: 2200 - k * 1200, to: 80 });
  if (radius >= 30)
    o.tone({ wave: 'sine', freq: 90, to: 30, dur: 0.3 + k * 0.8, vol: 0.3 + k * 0.2 });
}
