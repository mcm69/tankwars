/**
 * Tiny WebAudio synthesizer: enveloped oscillators and filtered noise, PC-speaker spirit,
 * no audio files. Silent (and harmless) until the browser allows audio, which needs a user
 * gesture; also silent where WebAudio doesn't exist (tests, old browsers).
 */

export interface ToneSpec {
  wave?: OscillatorType;
  freq: number;
  /** Pitch to slide to over the duration. */
  to?: number;
  /** Seconds. */
  dur: number;
  /** Peak gain, 0–1. */
  vol?: number;
  /** Seconds from now. */
  delay?: number;
}

export interface NoiseSpec {
  dur: number;
  vol?: number;
  delay?: number;
  filter?: BiquadFilterType;
  /** Filter frequency (Hz), sliding to `to` over the duration. */
  freq?: number;
  to?: number;
  q?: number;
}

/** A sustained voice whose pitch can be changed while it plays (the fly sound). */
export interface Voice {
  setPitch(freq: number): void;
  stop(): void;
}

/** What the sound effects need from a synthesizer (so tests can substitute a fake). */
export interface SoundOut {
  tone(spec: ToneSpec): void;
  noise(spec: NoiseSpec): void;
  voice(wave: OscillatorType, freq: number, vol: number): Voice | null;
  setVolume(volume: number): void;
}

const MIN_GAIN = 0.0001;

export class Synth implements SoundOut {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private volume = 0.7;

  constructor(target: Window | null = typeof window === 'undefined' ? null : window) {
    // Browsers only start audio after a user gesture; hook the first few.
    const unlock = () => this.unlock();
    target?.addEventListener('pointerdown', unlock);
    target?.addEventListener('keydown', unlock);
  }

  unlock(): void {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate; // one second of white noise, looped
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    // Resuming can be refused (no gesture yet); a later gesture tries again.
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  private get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running' && !!this.master;
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.master && this.ctx)
      this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.02);
  }

  private envelope(gain: GainNode, t0: number, dur: number, vol: number): void {
    gain.gain.setValueAtTime(MIN_GAIN, t0);
    gain.gain.exponentialRampToValueAtTime(Math.max(MIN_GAIN, vol), t0 + Math.min(0.01, dur / 4));
    gain.gain.exponentialRampToValueAtTime(MIN_GAIN, t0 + dur);
  }

  tone({ wave = 'square', freq, to, dur, vol = 0.2, delay = 0 }: ToneSpec): void {
    if (!this.ready) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(freq, t0);
    if (to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
    const gain = ctx.createGain();
    this.envelope(gain, t0, dur, vol);
    osc.connect(gain).connect(this.master!);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  noise({
    dur,
    vol = 0.3,
    delay = 0,
    filter = 'lowpass',
    freq = 2000,
    to,
    q = 1,
  }: NoiseSpec): void {
    if (!this.ready || !this.noiseBuffer) return;
    const ctx = this.ctx!;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const biquad = ctx.createBiquadFilter();
    biquad.type = filter;
    biquad.Q.value = q;
    biquad.frequency.setValueAtTime(freq, t0);
    if (to !== undefined) biquad.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    const gain = ctx.createGain();
    this.envelope(gain, t0, dur, vol);
    src.connect(biquad).connect(gain).connect(this.master!);
    src.start(t0, Math.random() * 0.9);
    src.stop(t0 + dur + 0.05);
  }

  voice(wave: OscillatorType, freq: number, vol: number): Voice | null {
    if (!this.ready) return null;
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(MIN_GAIN, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(vol, ctx.currentTime + 0.05);
    osc.connect(gain).connect(this.master!);
    osc.start();
    let stopped = false;
    return {
      setPitch: (f) => {
        if (!stopped) osc.frequency.setTargetAtTime(Math.max(20, f), ctx.currentTime, 0.02);
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        gain.gain.setTargetAtTime(MIN_GAIN, ctx.currentTime, 0.03);
        osc.stop(ctx.currentTime + 0.2);
      },
    };
  }
}
