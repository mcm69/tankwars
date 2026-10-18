import { describe, expect, it } from 'vitest';
import { Sfx, type AudioSettings } from '../src/audio/sfx';
import type { NoiseSpec, SoundOut, ToneSpec, Voice } from '../src/audio/synth';
import { itemIndex } from '../src/sim/items';
import type { RoundEvent } from '../src/sim/world';

class FakeOut implements SoundOut {
  tones: ToneSpec[] = [];
  noises: NoiseSpec[] = [];
  volume = -1;
  voices: { pitch: number; stopped: boolean }[] = [];
  tone(s: ToneSpec) {
    this.tones.push(s);
  }
  noise(s: NoiseSpec) {
    this.noises.push(s);
  }
  voice(_w: OscillatorType, freq: number): Voice {
    const v = { pitch: freq, stopped: false };
    this.voices.push(v);
    return { setPitch: (f) => (v.pitch = f), stop: () => (v.stopped = true) };
  }
  setVolume(v: number) {
    this.volume = v;
  }
  get count() {
    return this.tones.length + this.noises.length;
  }
}

function setup(settings: Partial<AudioSettings> = {}) {
  const out = new FakeOut();
  let t = 0;
  const s: AudioSettings = { sound: true, flySound: false, volume: 7, ...settings };
  const sfx = new Sfx(
    out,
    () => s,
    () => (t += 1000),
  ); // every call is a second apart
  return { out, sfx, s };
}

const EVENTS: RoundEvent[] = [
  { type: 'turn', tankId: 0 },
  { type: 'fire', tankId: 0, weapon: itemIndex('incinerator') },
  { type: 'fireRejected', tankId: 0, reason: 'laserEnergy' },
  { type: 'explode', x: 0, y: 0, radius: 20, harmless: false },
  { type: 'explode', x: 0, y: 0, radius: 4, harmless: true },
  { type: 'laser', tankId: 0 },
  { type: 'reaction', x: 0, y: 0 },
  { type: 'sonic', x: 0, y: 0 },
  { type: 'dirt', x: 0, y: 0, radius: 20 },
  { type: 'crumble' },
  { type: 'dud', tankId: 0 },
  { type: 'tankHit', tankId: 0, damage: 10 },
  { type: 'shieldHit', tankId: 0, absorbed: 10, kind: 'blast' },
  { type: 'tankDied', tankId: 0, style: 'standard' },
  { type: 'tankDied', tankId: 0, style: 'meltdown' },
  { type: 'roundOver', winnerId: 1 },
];

describe('sound effects', () => {
  it.each(EVENTS.map((e) => [e.type, e] as const))('%s makes a sound', (_type, e) => {
    const { out, sfx } = setup();
    sfx.roundEvent(e);
    expect(out.count).toBeGreaterThan(0);
    expect(sfx.played).toBe(1);
  });

  it('firing a laser leaves the sound to the laser event (no double sound)', () => {
    const { out, sfx } = setup();
    sfx.roundEvent({ type: 'fire', tankId: 0, weapon: itemIndex('laser') });
    expect(out.count).toBe(0);
  });

  it('bigger explosions are longer and louder', () => {
    const { out, sfx } = setup();
    sfx.roundEvent({ type: 'explode', x: 0, y: 0, radius: 8, harmless: false });
    sfx.roundEvent({ type: 'explode', x: 0, y: 0, radius: 115, harmless: false });
    const [small, big] = out.noises;
    expect(big!.dur).toBeGreaterThan(small!.dur);
    expect(big!.vol!).toBeGreaterThan(small!.vol!);
  });

  it('is silent when sound is off or the volume is zero, and applies the volume', () => {
    for (const s of [{ sound: false }, { volume: 0 }]) {
      const { out, sfx } = setup(s);
      for (const e of EVENTS) sfx.roundEvent(e);
      sfx.ui('select');
      expect(out.count).toBe(0);
    }
    const { out, sfx } = setup({ volume: 4 });
    sfx.ui('move');
    expect(out.volume).toBeCloseTo(0.4);
  });

  it('throttles bursts of the same sound', () => {
    const out = new FakeOut();
    let t = 0;
    const sfx = new Sfx(
      out,
      () => ({ sound: true, flySound: false, volume: 7 }),
      () => t,
    );
    for (let i = 0; i < 10; i++) {
      sfx.roundEvent({ type: 'tankHit', tankId: 0, damage: 8 });
      t += 10;
    }
    expect(sfx.played).toBe(2); // at t = 0 and t = 90 (80 ms throttle)
  });

  it('makes UI sounds', () => {
    const { out, sfx } = setup();
    for (const k of ['move', 'change', 'select', 'back', 'purchase', 'error'] as const) sfx.ui(k);
    expect(sfx.played).toBe(6);
    expect(out.count).toBeGreaterThanOrEqual(6);
  });

  it('fly sound follows the shell only when enabled', () => {
    const off = setup();
    off.sfx.flying(100);
    expect(off.out.voices).toHaveLength(0);

    const { out, sfx, s } = setup({ flySound: true });
    sfx.flying(50);
    sfx.flying(150);
    expect(out.voices).toHaveLength(1);
    expect(out.voices[0]!.pitch).toBeGreaterThan(300 + 50 * 3);
    sfx.flying(null);
    expect(out.voices[0]!.stopped).toBe(true);
    sfx.flying(80);
    s.sound = false;
    sfx.flying(90); // muting mid-flight stops it
    expect(out.voices[1]!.stopped).toBe(true);
  });
});
