import { config } from '../config';
import type { Blob } from '../entities/Blob';
import type { Droplet } from '../entities/Droplet';
import type { Pool } from '../utils/pool';
import { SpatialGrid } from '../utils/spatialGrid';

export interface MagnetismBounds {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

// Reports an enemy<->enemy collision so the caller can resolve chain kills /
// bomb blasts without this module knowing about scoring.
export type CollisionCb = (a: Droplet, b: Droplet, relSpeed: number) => void;

export class Magnetism {
  private grid = new SpatialGrid(config.resonance.interactionRadius);

  /**
   * Apply all magnetic forces for one frame and feed blob surface deformation.
   * Assumes blob.beginDeform() was called by the caller.
   */
  update(
    dt: number,
    blob: Blob,
    enemies: Pool<Droplet>,
    charge: number,
    bounds: MagnetismBounds,
    onCollision: CollisionCb
  ): void {
    const fieldRadius =
      config.magnetism.baseRadius + config.magnetism.chargeRadiusBonus * charge;
    const strength =
      config.magnetism.baseStrength + config.magnetism.chargeStrengthBonus * charge;
    const minD = config.magnetism.minDistance;
    const maxSpeed = config.magnetism.maxEnemySpeed;

    const items = enemies.items;

    // ---- blob <-> enemy ----
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.alive) continue;

      // Charger always matches the blob's polarity (so it's always repelled).
      if (e.kind === 'charger') e.polarity = blob.polarity;

      const dx = e.x - blob.cx;
      const dy = e.y - blob.cy;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      if (!e.isNeutral && dist < fieldRadius) {
        const opposite = e.polarity !== blob.polarity;
        const d2 = Math.max(dist, minD);
        let f = strength / (d2 * d2);

        if (opposite) {
          // attracted inward — but heavies need high charge to be reeled in
          if (e.kind === 'heavy' && charge < e.chargeToPull) f *= 0.08;
          e.vx -= nx * f * dt;
          e.vy -= ny * f * dt;
        } else {
          // same charge — shoved outward along the field line
          f *= config.magnetism.repelMultiplier;
          e.vx += nx * f * dt;
          e.vy += ny * f * dt;
        }
      }

      // feed surface deformation: spike out toward attracted, pull in for repelled
      const attract = e.isNeutral ? 0 : e.polarity !== blob.polarity ? 1 : -0.5;
      if (attract !== 0) blob.addInfluence(e.x, e.y, attract, charge);

      // clamp speed
      const sp = Math.hypot(e.vx, e.vy);
      if (sp > maxSpeed) {
        const k = maxSpeed / sp;
        e.vx *= k;
        e.vy *= k;
      }
    }

    if (!config.resonance.enabled) return;

    // ---- enemy <-> enemy (resonance / herding) via spatial grid ----
    this.grid.reset(bounds.minX, bounds.minY, bounds.width, bounds.height);
    for (let i = 0; i < items.length; i++) {
      if (items[i].alive) this.grid.insert(i, items[i].x, items[i].y);
    }

    const rStrength = config.resonance.strength;
    const rMin = config.resonance.minDistance;
    const rRad = config.resonance.interactionRadius;
    const chainSpeed = config.resonance.collisionChainSpeed;

    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (!a.alive) continue;
      this.grid.forEachNeighbor(a.x, a.y, (j) => {
        if (j <= i) return; // each unordered pair once
        const b = items[j];
        if (!b.alive) return;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist > rRad || dist <= 0) return;
        const nx = dx / dist;
        const ny = dy / dist;

        // contact -> potential chain collision (bombs, herding kills)
        if (dist < a.radius + b.radius) {
          const relSpeed = Math.hypot(a.vx - b.vx, a.vy - b.vy);
          if (relSpeed > chainSpeed) onCollision(a, b, relSpeed);
        }

        // neutrals don't participate in magnetic resonance
        if (a.isNeutral || b.isNeutral) return;

        const d2 = Math.max(dist, rMin);
        const f = (rStrength / (d2 * d2)) * dt;
        const opposite = a.polarity !== b.polarity;
        // opposite attract (pull together), same repel (push apart)
        const dir = opposite ? -1 : 1;
        a.vx -= nx * f * dir;
        a.vy -= ny * f * dir;
        b.vx += nx * f * dir;
        b.vy += ny * f * dir;
      });
    }

    // re-clamp after resonance
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.alive) continue;
      const sp = Math.hypot(e.vx, e.vy);
      if (sp > maxSpeed) {
        const k = maxSpeed / sp;
        e.vx *= k;
        e.vy *= k;
      }
    }
  }
}
