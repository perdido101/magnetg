import type { Poolable } from '../utils/pool';

// Ink-splat particle for kills / pulse / boss break. Pooled.
export class Particle implements Poolable {
  alive = false;
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  life = 0; // seconds remaining
  maxLife = 1;
  size = 2;
  color = '#fff';
  glow = false;

  reset(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    size: number,
    color: string,
    glow: boolean
  ): void {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.size = size;
    this.color = color;
    this.glow = glow;
  }

  update(dt: number): void {
    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return;
    }
    // viscous drag — ink in fluid
    const drag = Math.exp(-3.5 * dt);
    this.vx *= drag;
    this.vy *= drag;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}
