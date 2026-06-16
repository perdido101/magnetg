import type { Poolable } from '../utils/pool';
import type { Polarity } from '../config';

export type EnemyKind =
  | 'basic'
  | 'splitter'
  | 'heavy'
  | 'charger'
  | 'bomb'
  | 'neutral';

// An enemy ferrofluid droplet. Behavior is driven by `kind` + the behavior
// table in config; magnetism.ts reads these fields, never the other way round.
export class Droplet implements Poolable {
  alive = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  polarity: Polarity = 1; // neutral enemies ignore this
  kind: EnemyKind = 'basic';
  radius = 12;
  health = 1;
  score = 100;

  // rendering / feel
  stretch = 0; // 0..1 teardrop deformation toward blob
  stretchAngle = 0; // direction of stretch
  spawnFlash = 0; // 0..1 fades after spawn
  wobble = 0; // phase for organic jiggle

  // kind-specific
  isNeutral = false; // immune to blob field, only pulse clears
  splitInto = 0; // splitter: children count
  blastRadius = 0; // bomb: chain radius
  chargeToPull = 0; // heavy: min player charge before it gets attracted

  reset(): void {
    this.vx = 0;
    this.vy = 0;
    this.stretch = 0;
    this.stretchAngle = 0;
    this.spawnFlash = 1;
    this.wobble = Math.random() * Math.PI * 2;
    this.isNeutral = false;
    this.splitInto = 0;
    this.blastRadius = 0;
    this.chargeToPull = 0;
  }
}
