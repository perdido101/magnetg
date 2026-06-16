import { config } from '../config';
import { TAU, clamp } from '../utils/math';
import { rimColor } from '../config';
import type { Blob } from '../entities/Blob';
import type { Pulse } from '../systems/pulse';
import type { Score } from '../systems/score';
import type { Boss } from '../entities/Boss';
import type { ScoreRow } from '../systems/leaderboard';

export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// HUD + screens. Health, charge ring, pulse cooldown ring, score/combo, wave,
// boss bar. Charge is mostly readable from the blob shape; rings stay subtle.
export class UI {
  // ---- in-game HUD ----
  drawHUD(
    ctx: CanvasRenderingContext2D,
    w: number,
    _h: number,
    insets: Insets,
    blob: Blob,
    charge: number,
    pulse: Pulse,
    score: Score,
    chargingMs: number,
    wave: number
  ): void {
    const top = insets.top + 14;

    // health bar (top-left)
    const hbW = Math.min(220, w * 0.5);
    const hbH = 8;
    const hbX = insets.left + 16;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, hbX, top, hbW, hbH, 4);
    ctx.fill();
    const hp = blob.health / config.blob.maxHealth;
    ctx.fillStyle = config.colors.health;
    roundRect(ctx, hbX, top, hbW * hp, hbH, 4);
    ctx.fill();
    ctx.restore();

    // score + combo (top-right)
    ctx.save();
    ctx.textAlign = 'right';
    ctx.fillStyle = config.colors.text;
    ctx.font = '700 24px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(String(score.total), w - insets.right - 16, top + 22);
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = config.colors.textDim;
    ctx.fillText(`BEST ${score.best}`, w - insets.right - 16, top + 40);

    const mult = score.multiplier;
    if (mult > 1.001) {
      ctx.fillStyle = rimColor(blob.polarity);
      ctx.font = '800 18px ui-sans-serif, system-ui, sans-serif';
      ctx.globalAlpha = clamp(score.comboMs / config.score.comboWindowMs, 0.3, 1);
      ctx.fillText(`x${mult.toFixed(1)}`, w - insets.right - 16, top + 62);
    }
    ctx.restore();

    // wave indicator (top-center)
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = config.colors.textDim;
    ctx.font = '700 13px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(`WAVE ${wave}`, w / 2, top + 14);
    ctx.restore();

    // pulse cooldown / charging ring around the blob
    this.drawPulseRing(ctx, blob, charge, pulse, chargingMs);
  }

  private drawPulseRing(
    ctx: CanvasRenderingContext2D,
    blob: Blob,
    charge: number,
    pulse: Pulse,
    chargingMs: number
  ): void {
    const r = blob.radius(charge) + 16;
    ctx.save();
    ctx.translate(blob.cx, blob.cy);

    // background track
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.stroke();

    // cooldown fill
    const fill = pulse.cooldownFill;
    if (fill < 1) {
      ctx.strokeStyle = 'rgba(207,227,255,0.45)';
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI / 2, -Math.PI / 2 + TAU * fill);
      ctx.stroke();
    } else {
      // ready — soft full ring
      ctx.strokeStyle = 'rgba(207,227,255,0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, TAU);
      ctx.stroke();
    }

    // charging-a-pulse arc (brightens as you hold)
    if (chargingMs > 0 && pulse.ready) {
      const t = clamp(
        (chargingMs - config.pulse.minHoldMs) /
          (config.pulse.fullChargeMs - config.pulse.minHoldMs),
        0,
        1
      );
      ctx.lineWidth = 5;
      ctx.strokeStyle = config.colors.pulseRing;
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath();
      ctx.arc(0, 0, r + 6, -Math.PI / 2, -Math.PI / 2 + TAU * t);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawBossBar(ctx: CanvasRenderingContext2D, w: number, insets: Insets, boss: Boss): void {
    if (!boss.alive) return;
    const bw = Math.min(360, w * 0.7);
    const bh = 10;
    const x = (w - bw) / 2;
    const y = insets.top + 54;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, x, y, bw, bh, 5);
    ctx.fill();
    const frac = clamp(boss.totalHealth / boss.maxTotalHealth, 0, 1);
    ctx.fillStyle = '#d96cff';
    roundRect(ctx, x, y, bw * frac, bh, 5);
    ctx.fill();
    ctx.textAlign = 'center';
    ctx.fillStyle = config.colors.text;
    ctx.font = '800 12px ui-sans-serif, system-ui, sans-serif';
    const label =
      boss.kind === 'core'
        ? 'THE CORE'
        : boss.kind === 'twins'
          ? 'THE TWINS'
          : 'THE SWARM QUEEN';
    ctx.fillText(label, w / 2, y - 6);
    if (boss.kind === 'queen' && boss.shield > 0) {
      ctx.fillStyle = config.colors.textDim;
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(`SHIELD ${boss.shield} — herd minions in`, w / 2, y + bh + 16);
    }
    ctx.restore();
  }

  // ---- menu ----
  drawMenu(ctx: CanvasRenderingContext2D, w: number, h: number, best: number): void {
    dim(ctx, w, h, 0.35);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = config.colors.text;
    ctx.font = '900 64px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('MAGNET', w / 2, h * 0.36);

    ctx.font = '500 16px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = config.colors.textDim;
    ctx.fillText('TAP to flip polarity   •   HOLD to pulse', w / 2, h * 0.36 + 38);
    ctx.fillText('Pull in opposites. Shove away likeness. Survive.', w / 2, h * 0.36 + 62);

    pulseText(ctx, 'TAP TO PLAY', w / 2, h * 0.62);

    if (best > 0) {
      ctx.fillStyle = config.colors.textDim;
      ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(`BEST ${best}`, w / 2, h * 0.62 + 40);
    }
    ctx.restore();
  }

  // ---- game over + leaderboard ----
  drawGameOver(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    score: Score,
    wave: number,
    newBest: boolean,
    board: ScoreRow[],
    boardEnabled: boolean
  ): void {
    dim(ctx, w, h, 0.6);
    ctx.save();
    ctx.textAlign = 'center';

    ctx.fillStyle = config.colors.text;
    ctx.font = '900 40px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText('GAME OVER', w / 2, h * 0.16);

    ctx.font = '800 48px ui-sans-serif, system-ui, sans-serif';
    ctx.fillText(String(score.total), w / 2, h * 0.16 + 64);

    ctx.font = '600 15px ui-sans-serif, system-ui, sans-serif';
    ctx.fillStyle = config.colors.textDim;
    ctx.fillText(`WAVE ${wave}   •   BEST ${score.best}`, w / 2, h * 0.16 + 94);
    if (newBest) {
      ctx.fillStyle = config.colors.posRim;
      ctx.font = '800 16px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('NEW BEST!', w / 2, h * 0.16 + 120);
    }

    // leaderboard list
    const listY = h * 0.4;
    if (boardEnabled) {
      ctx.fillStyle = config.colors.text;
      ctx.font = '800 14px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('GLOBAL TOP', w / 2, listY - 14);
      ctx.font = '600 14px ui-sans-serif, system-ui, sans-serif';
      const rows = board.slice(0, 8);
      if (rows.length === 0) {
        ctx.fillStyle = config.colors.textDim;
        ctx.fillText('— no scores yet —', w / 2, listY + 12);
      }
      rows.forEach((r, i) => {
        const y = listY + 12 + i * 22;
        ctx.textAlign = 'left';
        ctx.fillStyle = config.colors.textDim;
        ctx.fillText(`${i + 1}.`, w / 2 - 130, y);
        ctx.fillStyle = config.colors.text;
        ctx.fillText(r.name, w / 2 - 105, y);
        ctx.textAlign = 'right';
        ctx.fillText(String(r.score), w / 2 + 130, y);
        ctx.textAlign = 'center';
      });
    }

    pulseText(ctx, 'TAP TO RETRY', w / 2, h * 0.88);
    ctx.restore();
  }
}

// ---- small canvas helpers ----
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const rr = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function dim(ctx: CanvasRenderingContext2D, w: number, h: number, a: number): void {
  ctx.save();
  ctx.fillStyle = `rgba(3,3,7,${a})`;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

function pulseText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number): void {
  const a = 0.55 + 0.45 * Math.sin(performance.now() / 360);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = config.colors.text;
  ctx.font = '800 22px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  ctx.restore();
}
