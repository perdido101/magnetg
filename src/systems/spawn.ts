import { config, type Polarity, POSITIVE, NEGATIVE } from '../config';
import type { Droplet, EnemyKind } from '../entities/Droplet';
import { TAU } from '../utils/math';

export interface SpawnContext {
  cx: number;
  cy: number;
  width: number;
  height: number;
}

type Acquire = () => Droplet | null;

// Configure a freshly-acquired droplet for a given kind. Shared by the spawner
// and by splitter offspring so behavior stays in one place.
export function configureDroplet(
  e: Droplet,
  kind: EnemyKind,
  polarity: Polarity,
  x: number,
  y: number
): void {
  e.reset();
  e.kind = kind;
  e.x = x;
  e.y = y;
  e.polarity = polarity;

  const defs = config.enemies;
  switch (kind) {
    case 'basic':
      e.radius = defs.basic.radius;
      e.health = defs.basic.health;
      e.score = defs.basic.score;
      break;
    case 'splitter':
      e.radius = defs.splitter.radius;
      e.health = defs.splitter.health;
      e.score = defs.splitter.score;
      e.splitInto = defs.splitter.splitInto;
      break;
    case 'heavy':
      e.radius = defs.heavy.radius;
      e.health = defs.heavy.health;
      e.score = defs.heavy.score;
      e.chargeToPull = defs.heavy.chargeToPull;
      break;
    case 'charger':
      e.radius = defs.charger.radius;
      e.health = defs.charger.health;
      e.score = defs.charger.score;
      break;
    case 'bomb':
      e.radius = defs.bomb.radius;
      e.health = defs.bomb.health;
      e.score = defs.bomb.score;
      e.blastRadius = defs.bomb.blastRadius;
      break;
    case 'neutral':
      e.radius = defs.neutral.radius;
      e.health = defs.neutral.health;
      e.score = defs.neutral.score;
      e.isNeutral = true;
      break;
  }
}

export class Spawn {
  wave = 0;
  private target = 0;
  spawnedThisWave = 0;
  private timer = 0;

  reset(): void {
    this.wave = 0;
    this.target = 0;
    this.spawnedThisWave = 0;
    this.timer = 0;
  }

  startWave(wave: number): void {
    this.wave = wave;
    this.spawnedThisWave = 0;
    this.timer = 0;
    this.target =
      config.spawn.enemiesPerWaveBase + config.spawn.enemiesPerWaveRamp * (wave - 1);
  }

  isBossWave(): boolean {
    return this.wave > 0 && this.wave % config.spawn.bossEveryWaves === 0;
  }

  allSpawned(): boolean {
    return this.spawnedThisWave >= this.target;
  }

  private get interval(): number {
    return Math.max(
      config.spawn.minInterval,
      config.spawn.baseInterval - config.spawn.intervalRampPerWave * (this.wave - 1)
    );
  }

  private get batch(): number {
    return (
      config.spawn.baseBatch + Math.floor((this.wave - 1) / config.spawn.batchEveryWaves)
    );
  }

  private get driftSpeed(): number {
    return config.spawn.baseDriftSpeed + config.spawn.driftRampPerWave * (this.wave - 1);
  }

  // Weighted pick among kinds unlocked by the current wave. Basic dominates.
  private pickKind(): EnemyKind {
    const w = this.wave;
    const pool: EnemyKind[] = [];
    const add = (k: EnemyKind, weight: number, firstWave: number) => {
      if (w >= firstWave) for (let i = 0; i < weight; i++) pool.push(k);
    };
    add('basic', 10, config.enemies.basic.firstWave);
    add('splitter', 4, config.enemies.splitter.firstWave);
    add('heavy', 3, config.enemies.heavy.firstWave);
    add('charger', 3, config.enemies.charger.firstWave);
    add('bomb', 2, config.enemies.bomb.firstWave);
    add('neutral', 2, config.enemies.neutral.firstWave);
    return pool[(Math.random() * pool.length) | 0] ?? 'basic';
  }

  private spawnOne(ctx: SpawnContext, acquire: Acquire): void {
    const e = acquire();
    if (!e) return;
    const ang = Math.random() * TAU;
    const r = Math.max(ctx.width, ctx.height) / 2 + config.spawn.spawnMarginPx;
    const x = ctx.cx + Math.cos(ang) * r;
    const y = ctx.cy + Math.sin(ang) * r;
    const kind = this.pickKind();
    const polarity: Polarity = Math.random() < 0.5 ? POSITIVE : NEGATIVE;
    configureDroplet(e, kind, polarity, x, y);
    // inward drift toward center (magnetism layers on top)
    const sp = this.driftSpeed * (0.85 + Math.random() * 0.4);
    e.vx = (ctx.cx - x) / r * sp;
    e.vy = (ctx.cy - y) / r * sp;
    this.spawnedThisWave++;
  }

  /** Spawn regular-wave enemies on cadence. No-op once the wave is fully spawned. */
  update(dt: number, ctx: SpawnContext, acquire: Acquire): void {
    if (this.isBossWave()) return; // boss handled by main
    if (this.allSpawned()) return;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer += this.interval;
      const n = Math.min(this.batch, this.target - this.spawnedThisWave);
      for (let i = 0; i < n; i++) this.spawnOne(ctx, acquire);
    }
  }
}
