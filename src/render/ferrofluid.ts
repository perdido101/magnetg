import { config, type Polarity, POSITIVE } from '../config';
import { rimColor, glowColor } from '../config';
import { TAU } from '../utils/math';
import type { Blob } from '../entities/Blob';
import type { Droplet } from '../entities/Droplet';
import type { Particle } from '../entities/Particle';
import type { Pool } from '../utils/pool';
import type { Boss } from '../entities/Boss';
import type { Pulse } from '../systems/pulse';

export type QualityTier = 'high' | 'med' | 'low';

// Renders everything as black ferrofluid with light trapped beneath: wet
// obsidian bodies, additive glow only on rim / highlights / field lines.
export class Ferrofluid {
  private t = 0;

  update(dt: number): void {
    this.t += dt;
  }

  // ---- faint flowing radial field lines, beneath everything ----
  drawFieldLines(
    ctx: CanvasRenderingContext2D,
    blob: Blob,
    charge: number,
    tier: QualityTier,
    maxR: number
  ): void {
    if (tier === 'low') return;
    const count = tier === 'high' ? config.render.fieldLines : (config.render.fieldLines >> 1);
    const intensity = 0.04 + 0.12 * charge;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = glowColor(blob.polarity).replace(/[\d.]+\)$/, `${intensity})`);
    ctx.lineWidth = 1;
    const r0 = blob.radius(charge);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU + this.t * 0.15 * blob.polarity;
      const wobble = Math.sin(this.t * 1.3 + i) * 6;
      ctx.beginPath();
      ctx.moveTo(blob.cx + Math.cos(a) * r0, blob.cy + Math.sin(a) * r0);
      const steps = 5;
      for (let s = 1; s <= steps; s++) {
        const rr = r0 + (maxR - r0) * (s / steps);
        const aa = a + (wobble / rr) * (s / steps);
        ctx.lineTo(blob.cx + Math.cos(aa) * rr, blob.cy + Math.sin(aa) * rr);
      }
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- enemy droplet: dark glossy body, stretches toward blob, rim glow ----
  drawDroplets(
    ctx: CanvasRenderingContext2D,
    enemies: Pool<Droplet>,
    tier: QualityTier
  ): void {
    enemies.forEachAlive((e) => {
      const rim = e.isNeutral ? 'rgba(150,150,165,0.9)' : rimColor(e.polarity);
      const glow = e.isNeutral ? 'rgba(150,150,165,0.4)' : glowColor(e.polarity);
      const r = e.radius;
      const stretch = 1 + e.stretch * 0.9;

      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(e.stretchAngle);
      ctx.scale(stretch, 1 / Math.sqrt(stretch));

      // glow halo (additive)
      if (tier !== 'low') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const hg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 2.2);
        hg.addColorStop(0, glow);
        hg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(0, 0, r * 2.2, 0, TAU);
        ctx.fill();
        ctx.restore();
      }

      // dark body
      const bg = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
      bg.addColorStop(0, config.colors.fluidMid);
      bg.addColorStop(1, config.colors.fluidDark);
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.fill();

      // rim light + spawn flash
      ctx.lineWidth = 1.5 + e.spawnFlash * 2;
      ctx.strokeStyle = rim;
      ctx.globalAlpha = 0.5 + 0.5 * e.spawnFlash;
      ctx.stroke();
      ctx.globalAlpha = 1;

      // tiny specular dab
      if (tier === 'high') {
        ctx.fillStyle = 'rgba(220,230,255,0.25)';
        ctx.beginPath();
        ctx.arc(-r * 0.35, -r * 0.35, r * 0.28, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    });
  }

  // ---- the blob: deformable spiky ring, wet obsidian, sliding specular ----
  drawBlob(ctx: CanvasRenderingContext2D, blob: Blob, charge: number, tier: QualityTier): void {
    const r0 = blob.radius(charge);
    const n = blob.n;
    const cx = blob.cx;
    const cy = blob.cy;
    const flick = blob.isInvulnerable() ? (Math.sin(this.t * 40) > 0 ? 0.4 : 1) : 1;

    // precompute ring points
    const px: number[] = [];
    const py: number[] = [];
    for (let i = 0; i < n; i++) {
      const rr = r0 + blob.offset[i];
      px.push(cx + Math.cos(blob.angle[i]) * rr);
      py.push(cy + Math.sin(blob.angle[i]) * rr);
    }

    // outer glow rim (additive), brightens with charge + flip ripple
    ctx.save();
    ctx.globalAlpha = flick;
    if (tier !== 'low') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gr = r0 * (1.8 + charge);
      const og = ctx.createRadialGradient(cx, cy, r0 * 0.5, cx, cy, gr);
      const a = 0.18 + 0.25 * charge + 0.25 * blob.flipRipple;
      og.addColorStop(0, glowColor(blob.polarity).replace(/[\d.]+\)$/, `${a})`));
      og.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = og;
      ctx.beginPath();
      ctx.arc(cx, cy, gr, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    // body path (smooth closed curve through ring points)
    ctx.beginPath();
    this.tracePath(ctx, px, py, tier);
    ctx.closePath();

    // wet obsidian fill
    const bodyGrad = ctx.createRadialGradient(
      cx - r0 * 0.35,
      cy - r0 * 0.4,
      r0 * 0.1,
      cx,
      cy,
      r0 * 1.3
    );
    bodyGrad.addColorStop(0, config.colors.fluidMid);
    bodyGrad.addColorStop(0.6, config.colors.fluidDark);
    bodyGrad.addColorStop(1, '#000');
    ctx.fillStyle = bodyGrad;
    ctx.fill();

    // rim light in polarity color
    ctx.lineWidth = 2;
    ctx.strokeStyle = rimColor(blob.polarity);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = (0.5 + 0.5 * charge) * flick;
    ctx.stroke();
    ctx.restore();

    // sliding specular highlight — fake reflection. Flip inverts it.
    if (tier !== 'low') {
      const inv = blob.flipRipple; // 0..1
      const slideX = Math.sin(this.t * 0.6) * r0 * 0.4;
      const slideY = Math.cos(this.t * 0.5) * r0 * 0.4;
      const sx = cx - r0 * 0.3 + slideX * (inv > 0.5 ? -1 : 1);
      const sy = cy - r0 * 0.35 + slideY;
      ctx.save();
      ctx.clip(); // clip to body
      const sg = ctx.createRadialGradient(sx, sy, 0, sx, sy, r0 * 0.9);
      sg.addColorStop(0, config.colors.specular.replace(/[\d.]+\)$/, `${0.55 * flick})`));
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      ctx.fillRect(cx - r0 * 2, cy - r0 * 2, r0 * 4, r0 * 4);
      ctx.restore();
    }
    ctx.restore();
  }

  // smooth closed curve through points using midpoint quadratics (or polygon on low)
  private tracePath(
    ctx: CanvasRenderingContext2D,
    px: number[],
    py: number[],
    tier: QualityTier
  ): void {
    const n = px.length;
    if (tier === 'low') {
      ctx.moveTo(px[0], py[0]);
      for (let i = 1; i < n; i++) ctx.lineTo(px[i], py[i]);
      return;
    }
    // start at midpoint of last->first
    const mx0 = (px[n - 1] + px[0]) / 2;
    const my0 = (py[n - 1] + py[0]) / 2;
    ctx.moveTo(mx0, my0);
    for (let i = 0; i < n; i++) {
      const cur = i;
      const nxt = (i + 1) % n;
      const mx = (px[cur] + px[nxt]) / 2;
      const my = (py[cur] + py[nxt]) / 2;
      ctx.quadraticCurveTo(px[cur], py[cur], mx, my);
    }
  }

  // ---- ink-splat particles ----
  drawParticles(ctx: CanvasRenderingContext2D, particles: Pool<Particle>, tier: QualityTier): void {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    particles.forEachAlive((p) => {
      const a = p.life / p.maxLife;
      ctx.globalAlpha = a;
      if (p.glow && tier !== 'low') {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        g.addColorStop(0, p.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, TAU);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  // ---- pulse shockwave ring ----
  drawPulse(ctx: CanvasRenderingContext2D, pulse: Pulse, blob: Blob): void {
    if (pulse.lastShock <= 0) return;
    const prog = 1 - pulse.lastShock; // 0..1 expanding
    const r = pulse.lastRadius * prog;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = pulse.lastShock * 0.8;
    ctx.lineWidth = 6 * pulse.lastShock + 1;
    ctx.strokeStyle = config.colors.pulseRing;
    ctx.beginPath();
    ctx.arc(blob.cx, blob.cy, r, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  // ---- boss bodies (functional visuals; identity polish is iterative) ----
  drawBoss(ctx: CanvasRenderingContext2D, boss: Boss, charge: number, tier: QualityTier): void {
    if (!boss.alive) return;
    for (const b of boss.bodies) {
      if (!b.alive && !b.downed) continue;
      const pol = b.polarity as Polarity;
      const downed = b.downed;
      const rim = downed ? 'rgba(120,120,130,0.8)' : rimColor(pol);
      const glow = downed ? 'rgba(120,120,130,0.3)' : glowColor(pol);
      const r = b.radius;

      ctx.save();
      // glow
      if (tier !== 'low') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const gg = ctx.createRadialGradient(b.x, b.y, r * 0.4, b.x, b.y, r * 2.4);
        gg.addColorStop(0, glow);
        gg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gg;
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 2.4, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      // body with wobble spikes
      ctx.beginPath();
      const verts = 24;
      for (let i = 0; i <= verts; i++) {
        const a = (i / verts) * TAU;
        const spk = Math.sin(a * 6 + this.t * 2) * r * 0.08 * (1 + charge);
        const rr = r + spk;
        const x = b.x + Math.cos(a) * rr;
        const y = b.y + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const bg = ctx.createRadialGradient(b.x - r * 0.3, b.y - r * 0.3, r * 0.1, b.x, b.y, r);
      bg.addColorStop(0, config.colors.fluidMid);
      bg.addColorStop(1, '#000');
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = boss.flashMs > 0 ? '#fff' : rim;
      ctx.stroke();

      // shield ring (queen)
      if (boss.kind === 'queen' && boss.shield > 0) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.lineWidth = 2;
        ctx.strokeStyle = pol === POSITIVE ? config.colors.posRim : config.colors.negRim;
        ctx.setLineDash([6, 8]);
        ctx.beginPath();
        ctx.arc(b.x, b.y, r * 1.5, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
  }
}
