import { config } from '../config';
import { clamp } from '../utils/math';
import type { Blob } from '../entities/Blob';
import type { Droplet } from '../entities/Droplet';
import type { Pool } from '../utils/pool';

// PULSE — hold to charge, release to fire a radial shockwave that shoves
// EVERYTHING out regardless of polarity. Cooldown (refilling ring). Strength
// scales with held duration AND current charge — and firing burns charge, so
// spending pulse is a real trade.
export class Pulse {
  cooldownMs = 0; // remaining cooldown; 0 == ready
  lastShock = 0; // 0..1 visual shockwave expansion, decays
  lastRadius = 0;

  reset(): void {
    this.cooldownMs = 0;
    this.lastShock = 0;
  }

  get ready(): boolean {
    return this.cooldownMs <= 0;
  }

  /** 0..1 cooldown fill for the UI ring (1 == ready). */
  get cooldownFill(): number {
    return 1 - clamp(this.cooldownMs / config.pulse.cooldownMs, 0, 1);
  }

  update(dt: number): void {
    if (this.cooldownMs > 0) this.cooldownMs = Math.max(0, this.cooldownMs - dt * 1000);
    if (this.lastShock > 0) this.lastShock = Math.max(0, this.lastShock - dt * 1.8);
  }

  /**
   * Fire if ready. Returns true if it actually fired (so caller can spend
   * charge, shake screen, sfx). holdMs above fullChargeMs caps power.
   */
  fire(
    blob: Blob,
    enemies: Pool<Droplet>,
    holdMs: number,
    playerCharge: number
  ): boolean {
    if (!this.ready) return false;
    this.cooldownMs = config.pulse.cooldownMs;
    this.lastShock = 1;
    this.lastRadius = config.pulse.radius;

    const holdT = clamp(
      (holdMs - config.pulse.minHoldMs) /
        (config.pulse.fullChargeMs - config.pulse.minHoldMs),
      0,
      1
    );
    const impulse =
      (config.pulse.baseStrength + config.pulse.chargeStrengthBonus * playerCharge) *
      (0.5 + 0.5 * holdT);
    const r = config.pulse.radius;

    enemies.forEachAlive((e) => {
      const dx = e.x - blob.cx;
      const dy = e.y - blob.cy;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist > r) return;
      const falloff = 1 - dist / r;
      const push = impulse * falloff;
      e.vx += (dx / dist) * push;
      e.vy += (dy / dist) * push;
    });

    // kick the blob surface outward — a big exhale
    for (let i = 0; i < blob.n; i++) blob.vel[i] += 160;
    return true;
  }
}
