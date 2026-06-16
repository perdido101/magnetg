import { config, type Polarity, POSITIVE, NEGATIVE } from '../config';
import { TAU, clamp } from '../utils/math';

// The player: a deformable polygon ring fixed at screen center. Never moves.
// Vertices spring outward toward attracted threats (spikes) and pull in away
// from repelled ones. Charge scales spike amplitude + frequency, so the danger
// state is readable in the shape alone.
export class Blob {
  cx = 0;
  cy = 0;
  polarity: Polarity = POSITIVE;
  health: number = config.blob.maxHealth;
  invulnMs = 0;

  // deformable ring
  readonly n = config.blob.vertices;
  readonly angle: number[] = [];
  readonly offset: number[] = []; // radial displacement from baseRadius
  readonly vel: number[] = []; // displacement velocity
  private target: number[] = []; // accumulated target displacement this frame

  // flip feel
  flipRipple = 0; // 0..1 decays after a flip, drives specular invert + ripple
  private wobbleT = 0;

  constructor() {
    for (let i = 0; i < this.n; i++) {
      this.angle.push((i / this.n) * TAU);
      this.offset.push(0);
      this.vel.push(0);
      this.target.push(0);
    }
  }

  reset(cx: number, cy: number): void {
    this.cx = cx;
    this.cy = cy;
    this.polarity = POSITIVE;
    this.health = config.blob.maxHealth;
    this.invulnMs = 0;
    this.flipRipple = 0;
    for (let i = 0; i < this.n; i++) {
      this.offset[i] = 0;
      this.vel[i] = 0;
      this.target[i] = 0;
    }
  }

  flip(): void {
    this.polarity = this.polarity === POSITIVE ? NEGATIVE : POSITIVE;
    this.flipRipple = 1;
    // kick a surface-tension ripple across the whole ring
    for (let i = 0; i < this.n; i++) {
      this.vel[i] += Math.sin((i / this.n) * TAU * 3) * 90;
    }
  }

  radius(charge: number): number {
    return config.blob.baseRadius * (1 + 0.35 * charge);
  }

  /** Reset per-frame deformation accumulator. */
  beginDeform(): void {
    for (let i = 0; i < this.n; i++) this.target[i] = 0;
  }

  /**
   * Feed one enemy's influence into the surface.
   * attract>0 spikes outward toward it; attract<0 pulls the rim inward.
   */
  addInfluence(ex: number, ey: number, attract: number, charge: number): void {
    const dx = ex - this.cx;
    const dy = ey - this.cy;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist > config.blob.spikeReach) return;
    const ang = Math.atan2(dy, dx);
    const falloff = 1 - dist / config.blob.spikeReach; // 0..1
    const amp =
      config.blob.maxSpikeAmplitude * falloff * (0.35 + 0.65 * charge) * attract;
    // sharpness of spike grows with charge -> aggressive bristling
    const sharp = 2.2 + charge * 5.5;
    for (let i = 0; i < this.n; i++) {
      let d = this.angle[i] - ang;
      // wrap to [-PI, PI]
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const w = Math.pow(Math.max(0, Math.cos(d)), sharp);
      this.target[i] += amp * w;
    }
  }

  update(dt: number, charge: number): void {
    if (this.invulnMs > 0) this.invulnMs -= dt * 1000;
    if (this.flipRipple > 0) this.flipRipple = Math.max(0, this.flipRipple - dt * 3.2);
    this.wobbleT += dt;

    const k = config.blob.spring;
    const damp = config.blob.damping;
    const maxAmp = config.blob.maxSpikeAmplitude;
    // idle breathing wobble grows subtly with charge
    const idleAmp = 1.5 + charge * 4;

    for (let i = 0; i < this.n; i++) {
      const idle =
        Math.sin(this.wobbleT * 2.1 + i * 0.7) * idleAmp +
        Math.sin(this.wobbleT * 3.7 - i * 1.3) * idleAmp * 0.4;
      const tgt = clamp(this.target[i] + idle, -maxAmp * 0.6, maxAmp);
      const a = (tgt - this.offset[i]) * k - this.vel[i] * damp;
      this.vel[i] += a * dt;
      this.offset[i] += this.vel[i] * dt;
    }
  }

  isInvulnerable(): boolean {
    return this.invulnMs > 0;
  }

  takeDamage(amount: number): boolean {
    if (this.isInvulnerable()) return false;
    this.health = Math.max(0, this.health - amount);
    this.invulnMs = config.blob.invulnMsOnHit;
    // jolt the surface inward on hit
    for (let i = 0; i < this.n; i++) this.vel[i] -= 120;
    return true;
  }
}
