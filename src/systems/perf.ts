import { config } from '../config';
import type { QualityTier } from '../render/ferrofluid';

// Auto-picks the ferrofluid quality tier from measured frame time. Degrades
// HIGH -> MED -> LOW (never auto-upgrades, to avoid oscillation). A sustained
// run of slow frames is required before stepping down.
export class Perf {
  tier: QualityTier = 'high';
  fps = 60;
  private samples: number[] = [];
  private overBudget = 0;

  sample(frameMs: number): void {
    this.samples.push(frameMs);
    if (this.samples.length > config.perf.sampleWindow) this.samples.shift();
    // rolling average for fps display
    let sum = 0;
    for (const s of this.samples) sum += s;
    const avg = sum / this.samples.length;
    this.fps = avg > 0 ? Math.round(1000 / avg) : 60;

    if (this.samples.length < config.perf.sampleWindow) return;

    const threshold =
      this.tier === 'high' ? config.perf.medThresholdMs : config.perf.lowThresholdMs;
    if (avg > threshold) {
      this.overBudget++;
      if (this.overBudget > 30) {
        if (this.tier === 'high') this.tier = 'med';
        else if (this.tier === 'med') this.tier = 'low';
        this.overBudget = 0;
        this.samples.length = 0;
      }
    } else {
      this.overBudget = Math.max(0, this.overBudget - 1);
    }
  }
}
