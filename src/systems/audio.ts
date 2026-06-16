// Minimal WebAudio SFX — synthesized, no assets. Fully optional: if the
// AudioContext can't be created it silently no-ops. Resumed on first input.
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  private ensure(): void {
    if (this.ctx || !this.enabled) return;
    try {
      const Ctor =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.25;
      this.master.connect(this.ctx.destination);
    } catch {
      this.enabled = false;
    }
  }

  /** Call from a user gesture to satisfy autoplay policies. */
  resume(): void {
    this.ensure();
    this.ctx?.resume?.().catch(() => {});
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain: number): void {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  flip(): void {
    this.blip(420, 0.08, 'triangle', 0.4);
  }
  kill(): void {
    this.blip(90, 0.18, 'sine', 0.7); // low magnetic "thunk"
  }
  pulse(): void {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    // downward sweep "woosh"
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.4);
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(g);
    g.connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.5);
  }
  hit(): void {
    this.blip(140, 0.25, 'square', 0.5);
  }
  boss(): void {
    this.blip(60, 0.6, 'sine', 0.8);
  }
}

export const audio = new AudioEngine();
