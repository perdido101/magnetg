import { config, type Polarity, POSITIVE, NEGATIVE } from '../config';
import { TAU } from '../utils/math';

export type BossKind = 'core' | 'twins' | 'queen';

// A single physical body. Twins use two bodies inside one Boss.
interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  polarity: Polarity;
  health: number;
  maxHealth: number;
  radius: number;
  downed: boolean; // twins: knocked out, awaiting revive window
  reviveMs: number;
  alive: boolean;
}

function makeBody(maxHealth: number, polarity: Polarity, radius: number): Body {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    polarity,
    health: maxHealth,
    maxHealth,
    radius,
    downed: false,
    reviveMs: 0,
    alive: true,
  };
}

// Bosses are polarity puzzles. The Core flips on a timer (hit only when your
// charge is OPPOSITE it). The Twins revive each other unless killed in sync.
// The Swarm Queen is shielded until herded minions slam into her.
export class Boss {
  kind: BossKind = 'core';
  alive = false;
  bodies: Body[] = [];
  cycle = 1; // which boss appearance (scales health)

  // shared timers
  flipTimerMs = 0; // core polarity flip
  ringTimerMs = 0; // queen minion ring cadence
  shield = 0; // queen: shield hits remaining
  flashMs = 0; // hit flash

  cx = 0;
  cy = 0;
  hitThisContact = false;

  spawn(kind: BossKind, cycle: number, cx: number, cy: number): void {
    this.kind = kind;
    this.cycle = cycle;
    this.cx = cx;
    this.cy = cy;
    this.alive = true;
    this.flipTimerMs = config.boss.coreFlipPeriodMs;
    this.ringTimerMs = config.boss.queenRingEveryMs;
    this.flashMs = 0;
    const hp = config.boss.baseHealth + config.boss.healthPerCycle * (cycle - 1);
    const r = config.boss.radius;

    this.bodies = [];
    if (kind === 'twins') {
      const a = makeBody(Math.ceil(hp * 0.6), POSITIVE, r * 0.8);
      const b = makeBody(Math.ceil(hp * 0.6), NEGATIVE, r * 0.8);
      a.x = cx - 140;
      a.y = -r;
      b.x = cx + 140;
      b.y = -r;
      this.bodies.push(a, b);
    } else if (kind === 'queen') {
      const q = makeBody(hp, POSITIVE, r * 1.1);
      q.x = cx;
      q.y = -r;
      this.bodies.push(q);
      this.shield = 5 + cycle;
    } else {
      const c = makeBody(hp, POSITIVE, r);
      c.x = cx;
      c.y = -r;
      this.bodies.push(c);
    }
  }

  get totalHealth(): number {
    let h = 0;
    for (const b of this.bodies) if (b.alive) h += Math.max(0, b.health);
    return h;
  }

  get maxTotalHealth(): number {
    let h = 0;
    for (const b of this.bodies) h += b.maxHealth;
    return h;
  }

  /**
   * Advance boss logic. `spawnMinion` is called by the Queen.
   * Returns true while the boss is still alive.
   */
  update(
    dt: number,
    _blobPolarity: Polarity,
    spawnMinion?: (x: number, y: number, polarity: Polarity) => void
  ): boolean {
    if (!this.alive) return false;
    const ms = dt * 1000;
    if (this.flashMs > 0) this.flashMs -= ms;

    if (this.kind === 'core') this.updateCore(dt, ms);
    else if (this.kind === 'twins') this.updateTwins(dt, ms);
    else this.updateQueen(dt, ms, spawnMinion);

    // descend toward arena center until in play
    for (const b of this.bodies) {
      if (!b.alive) continue;
      const targetY = this.cy * 0.62;
      if (b.y < targetY) b.y += config.boss.approachSpeed * 2 * dt * 4;
    }

    // death check
    let anyAlive = false;
    for (const b of this.bodies) if (b.alive) anyAlive = true;
    if (!anyAlive) this.alive = false;
    return this.alive;
  }

  private updateCore(_dt: number, ms: number): void {
    this.flipTimerMs -= ms;
    if (this.flipTimerMs <= 0) {
      this.flipTimerMs += config.boss.coreFlipPeriodMs;
      const c = this.bodies[0];
      c.polarity = c.polarity === POSITIVE ? NEGATIVE : POSITIVE;
    }
    // slow orbit drift for readability
    const c = this.bodies[0];
    c.x = this.cx + Math.sin(performance.now() / 1400) * 60;
  }

  private updateTwins(dt: number, ms: number): void {
    const [a, b] = this.bodies;
    for (const t of [a, b]) {
      if (t.downed && t.alive) {
        t.reviveMs -= ms;
        if (t.reviveMs <= 0) {
          // partner revives the downed twin
          t.downed = false;
          t.health = Math.ceil(t.maxHealth * 0.5);
        }
      }
    }
    // when one is downed, the other lunges toward center (more dangerous)
    const lunger = a.downed ? b : b.downed ? a : null;
    if (lunger && lunger.alive) {
      const dx = this.cx - lunger.x;
      lunger.x += Math.sign(dx) * 40 * dt + 0; // ease toward center
    } else {
      // gentle linked orbit
      const t = performance.now() / 1600;
      a.x = this.cx - 140 + Math.cos(t) * 30;
      b.x = this.cx + 140 - Math.cos(t) * 30;
    }
    // if both downed simultaneously -> both die for good
    if (a.downed && b.downed) {
      a.alive = false;
      b.alive = false;
    }
  }

  private updateQueen(
    _dt: number,
    ms: number,
    spawnMinion?: (x: number, y: number, polarity: Polarity) => void
  ): void {
    const q = this.bodies[0];
    q.x = this.cx + Math.sin(performance.now() / 2000) * 80;
    if (this.shield > 0 && spawnMinion) {
      this.ringTimerMs -= ms;
      if (this.ringTimerMs <= 0) {
        this.ringTimerMs += config.boss.queenRingEveryMs;
        const count = config.boss.queenRingCount;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * TAU;
          const r = 200;
          const pol: Polarity = i % 2 === 0 ? POSITIVE : NEGATIVE;
          spawnMinion(q.x + Math.cos(a) * r, q.y + Math.sin(a) * r, pol);
        }
      }
    }
  }

  /** A minion (or bomb) slammed into the Queen — chips her shield. */
  hitShield(): void {
    if (this.kind !== 'queen') return;
    if (this.shield > 0) {
      this.shield--;
      this.flashMs = 120;
    }
  }

  /**
   * Try to damage the boss given the player's current polarity.
   * Returns true if a hit landed.
   */
  damage(bodyIndex: number, blobPolarity: Polarity, amount: number): boolean {
    const b = this.bodies[bodyIndex];
    if (!b || !b.alive || b.downed) return false;

    if (this.kind === 'core') {
      // only vulnerable when player polarity is OPPOSITE the core's state
      if (blobPolarity === b.polarity) return false;
    } else if (this.kind === 'queen') {
      if (this.shield > 0) return false; // must break shield first
    } else if (this.kind === 'twins') {
      // vulnerable when opposite (you attract/pull it in)
      if (blobPolarity === b.polarity) return false;
    }

    b.health -= amount;
    this.flashMs = 120;
    if (b.health <= 0) {
      if (this.kind === 'twins') {
        // down it, start revive window unless partner already down
        b.downed = true;
        b.reviveMs = config.boss.twinsReviveMs;
        b.health = 0;
      } else {
        b.alive = false;
      }
    }
    return true;
  }
}
