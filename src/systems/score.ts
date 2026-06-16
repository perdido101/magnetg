import { config } from '../config';
import { clamp } from '../utils/math';

const BEST_KEY = 'magnet.best';

// Style-based scoring. The multiplier rewards killing WITHOUT flipping; flipping
// banks and resets it. Chain kills, full-ring clears and bosses pay bonuses.
export class Score {
  total = 0;
  best = 0;
  private noFlipStreak = 0;
  comboMs = 0; // visual cool-off window for the current streak
  lastGain = 0; // last points awarded (for floating popups)
  lastGainMs = 0;

  constructor() {
    try {
      this.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      this.best = 0;
    }
  }

  reset(): void {
    this.total = 0;
    this.noFlipStreak = 0;
    this.comboMs = 0;
    this.lastGain = 0;
  }

  get multiplier(): number {
    return clamp(
      1 + config.score.noFlipStep * this.noFlipStreak,
      1,
      config.score.noFlipMaxMult
    );
  }

  private award(points: number): void {
    this.total += Math.round(points);
    this.lastGain = Math.round(points);
    this.lastGainMs = config.score.comboWindowMs;
  }

  onKill(base: number): void {
    this.award(base * this.multiplier);
    this.noFlipStreak++;
    this.comboMs = config.score.comboWindowMs;
  }

  onFlip(): void {
    // banking happens implicitly; flipping just ends the no-flip streak
    this.noFlipStreak = 0;
  }

  onChainKill(count = 1): void {
    this.award(config.score.chainBonus * count);
  }

  onRingClear(): void {
    this.award(config.score.ringClearBonus);
  }

  onBossKill(): void {
    this.award(config.score.bossBonus);
  }

  update(dt: number): void {
    if (this.comboMs > 0) this.comboMs = Math.max(0, this.comboMs - dt * 1000);
    if (this.lastGainMs > 0) this.lastGainMs = Math.max(0, this.lastGainMs - dt * 1000);
  }

  finalize(): boolean {
    // returns true if a new best was set
    if (this.total > this.best) {
      this.best = this.total;
      try {
        localStorage.setItem(BEST_KEY, String(this.best));
      } catch {
        /* ignore */
      }
      return true;
    }
    return false;
  }
}
