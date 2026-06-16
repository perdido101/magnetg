import { config } from '../config';
import { clamp } from '../utils/math';

// CHARGE — the throttle. Each kill raises it; it bleeds over time. Charge
// scales the blob's field radius + strength (read in magnetism.ts) and its
// spike amplitude (read in Blob), so high charge clears fast but yanks
// opposite enemies in violently.
export class Charge {
  value = 0;

  reset(): void {
    this.value = 0;
  }

  addKill(): void {
    this.value = clamp(this.value + config.charge.perKill, 0, config.charge.max);
  }

  spend(amount: number): void {
    this.value = clamp(this.value - amount, 0, config.charge.max);
  }

  update(dt: number): void {
    if (this.value > 0) {
      this.value = clamp(this.value - config.charge.decayPerSec * dt, 0, config.charge.max);
    }
  }
}
