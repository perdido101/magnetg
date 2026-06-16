import { config } from '../config';
import type { Polarity } from '../config';
import { glowColor } from '../config';

// Deep near-black living gradient with a faint caustic shimmer. Restraint —
// the fluid is the star. Cheap: a couple of radial gradients + sparse blobs.
export class Background {
  private t = 0;

  update(dt: number): void {
    this.t += dt;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    cx: number,
    cy: number,
    charge: number,
    polarity: Polarity
  ): void {
    const t = this.t;
    // base gradient, slowly breathing
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, config.colors.bg0);
    g.addColorStop(1, config.colors.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // soft polarity-tinted glow under the blob, intensity tied to charge
    const rad = Math.max(w, h) * (0.35 + 0.25 * charge);
    const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    rg.addColorStop(0, glowColor(polarity).replace(/[\d.]+\)$/, `${0.08 + 0.12 * charge})`));
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);

    // faint caustic shimmer — a few drifting low-alpha blobs
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const px = cx + Math.sin(t * 0.13 + i * 1.7) * w * 0.35;
      const py = cy + Math.cos(t * 0.11 + i * 2.3) * h * 0.35;
      const pr = Math.max(w, h) * 0.18;
      const cg = ctx.createRadialGradient(px, py, 0, px, py, pr);
      cg.addColorStop(0, config.colors.bgShimmer);
      cg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
