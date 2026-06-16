import { config, POSITIVE, type Polarity } from './config';
import { rimColor } from './config';
import { clamp, TAU, randRange, makeRng } from './utils/math';
import { Pool } from './utils/pool';

import { Blob } from './entities/Blob';
import { Droplet } from './entities/Droplet';
import { Particle } from './entities/Particle';
import { Boss, type BossKind } from './entities/Boss';

import { Input } from './systems/input';
import { Magnetism } from './systems/magnetism';
import { Spawn, configureDroplet, type SpawnContext } from './systems/spawn';
import { Charge } from './systems/charge';
import { Pulse } from './systems/pulse';
import { Score } from './systems/score';
import { Perf } from './systems/perf';
import { audio } from './systems/audio';
import {
  fetchTop,
  submitScore,
  leaderboardEnabled,
  type ScoreRow,
} from './systems/leaderboard';

import { Background } from './render/background';
import { Ferrofluid } from './render/ferrofluid';
import { UI, type Insets } from './render/ui';

type GameState = 'menu' | 'playing' | 'gameover';

const rng = makeRng((Math.random() * 1e9) | 0);

class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private insets: Insets = { top: 0, bottom: 0, left: 0, right: 0 };

  // entities
  private blob = new Blob();
  private enemies = new Pool<Droplet>(() => new Droplet(), config.spawn.maxDroplets);
  private particles = new Pool<Particle>(() => new Particle(), config.particles.max);
  private boss = new Boss();
  private bossActive = false;

  // systems
  private magnetism = new Magnetism();
  private spawn = new Spawn();
  private charge = new Charge();
  private pulse = new Pulse();
  private score = new Score();
  private perf = new Perf();
  private input: Input;

  // renderers
  private bg = new Background();
  private fluid = new Ferrofluid();
  private ui = new UI();

  // state
  private state: GameState = 'menu';
  private lastTime = 0;
  private shake = 0;
  private waveBannerMs = 0;
  private gameOverLockMs = 0;
  private lastPosCount = 0;
  private lastNegCount = 0;

  // leaderboard
  private board: ScoreRow[] = [];
  private newBest = false;
  private nameOverlay?: HTMLDivElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas2D unavailable');
    this.ctx = ctx;

    this.input = new Input(canvas, {
      flip: () => this.onFlip(),
      pulse: (ms) => this.onPulse(ms),
      pulseChargeStart: () => {},
      isActionable: () => this.state === 'playing',
    });

    // menu / gameover advance (separate from gameplay input)
    canvas.addEventListener(
      'pointerdown',
      () => {
        audio.resume();
        if (this.state === 'menu') this.startGame();
        else if (this.state === 'gameover' && this.gameOverLockMs <= 0) this.startGame();
      },
      { passive: true }
    );

    this.buildNameOverlay();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      // avoid a huge dt spike when returning from background
      if (!document.hidden) this.lastTime = performance.now();
    });
    this.resize();
  }

  // ---------- setup / layout ----------
  private resize(): void {
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    this.dpr = Math.min(config.render.maxDpr, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.canvas.style.width = cssW + 'px';
    this.canvas.style.height = cssH + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.w = cssW;
    this.h = cssH;
    this.insets = readInsets();
    this.blob.cx = this.w / 2;
    this.blob.cy = this.h / 2;
  }

  // ---------- run control ----------
  private startGame(): void {
    this.enemies.clear();
    this.particles.clear();
    this.blob.reset(this.w / 2, this.h / 2);
    this.charge.reset();
    this.pulse.reset();
    this.score.reset();
    this.spawn.reset();
    this.bossActive = false;
    this.boss.alive = false;
    this.shake = 0;
    this.lastPosCount = 0;
    this.lastNegCount = 0;
    this.hideNameOverlay();
    this.state = 'playing';
    this.beginWave(1);
  }

  private beginWave(wave: number): void {
    this.spawn.startWave(wave);
    this.waveBannerMs = 1400;
    if (this.spawn.isBossWave()) this.spawnBoss();
  }

  private spawnBoss(): void {
    const cycle = Math.floor(this.spawn.wave / config.spawn.bossEveryWaves);
    const kinds: BossKind[] = ['core', 'twins', 'queen'];
    const kind = kinds[(cycle - 1) % kinds.length];
    this.boss.spawn(kind, cycle, this.w / 2, this.h);
    this.bossActive = true;
    audio.boss();
  }

  private gameOver(): void {
    this.state = 'gameover';
    this.gameOverLockMs = 700;
    this.newBest = this.score.finalize();
    audio.hit();
    // leaderboard is fully optional + async — never blocks
    if (leaderboardEnabled) {
      this.showNameOverlay();
      fetchTop(100)
        .then((rows) => (this.board = rows))
        .catch(() => {});
    }
  }

  // ---------- input handlers ----------
  private onFlip(): void {
    this.blob.flip();
    this.score.onFlip();
    audio.flip();
  }

  private onPulse(holdMs: number): void {
    const fired = this.pulse.fire(this.blob, this.enemies, holdMs, this.charge.value);
    if (fired) {
      this.charge.spend(config.pulse.chargeCost);
      this.shake = Math.max(this.shake, config.render.screenShakeBoss * 0.7);
      audio.pulse();
    }
  }

  // ---------- main loop ----------
  start(): void {
    this.lastTime = performance.now();
    const frame = (now: number) => {
      const frameMs = now - this.lastTime;
      this.lastTime = now;
      const dt = clamp(frameMs / 1000, 0, 1 / 30); // clamp big stalls
      this.update(dt);
      this.render();
      this.perf.sample(frameMs);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private update(dt: number): void {
    this.input.tick();
    this.bg.update(dt);
    this.fluid.update(dt);
    if (this.gameOverLockMs > 0) this.gameOverLockMs -= dt * 1000;
    if (this.waveBannerMs > 0) this.waveBannerMs -= dt * 1000;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - config.render.screenShakeDecay * dt);

    if (this.state !== 'playing') {
      // keep particles/blob breathing for life on menus
      this.blob.beginDeform();
      this.blob.update(dt, this.charge.value);
      this.updateParticles(dt);
      return;
    }

    this.charge.update(dt);
    this.pulse.update(dt);
    this.score.update(dt);

    const ctx: SpawnContext = { cx: this.blob.cx, cy: this.blob.cy, width: this.w, height: this.h };
    this.spawn.update(dt, ctx, () => this.enemies.spawn());

    // forces (also feeds blob deformation + reports collisions)
    this.blob.beginDeform();
    this.magnetism.update(
      dt,
      this.blob,
      this.enemies,
      this.charge.value,
      { minX: -100, minY: -100, width: this.w + 200, height: this.h + 200 },
      (a, b, rel) => this.onCollision(a, b, rel)
    );
    this.blob.update(dt, this.charge.value);

    this.updateEnemies(dt);
    this.updateParticles(dt);
    if (this.bossActive) this.updateBoss(dt);

    this.checkRingClear();
    this.checkWaveProgress();

    if (this.blob.health <= 0) this.gameOver();
  }

  // ---------- enemies ----------
  private updateEnemies(dt: number): void {
    const killR = config.blob.coreKillRadius;
    const despawnR = Math.max(this.w, this.h) / 2 + config.spawn.spawnMarginPx * 3;
    this.enemies.forEachAlive((e) => {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      if (e.spawnFlash > 0) e.spawnFlash = Math.max(0, e.spawnFlash - dt * 2);

      const dx = this.blob.cx - e.x;
      const dy = this.blob.cy - e.y;
      const dist = Math.hypot(dx, dy) || 1;

      // teardrop stretch toward blob when being attracted
      const attracted = !e.isNeutral && e.polarity !== this.blob.polarity;
      const towardSpeed = (e.vx * -dx + e.vy * -dy) / dist; // +ve = moving inward
      const targetStretch = attracted ? clamp(towardSpeed / 320, 0, 1) : 0;
      e.stretch += (targetStretch - e.stretch) * Math.min(1, dt * 8);
      e.stretchAngle = Math.atan2(dy, dx); // long axis points at blob

      // contact with the core
      if (dist < killR + e.radius) {
        if (e.isNeutral) {
          this.damagePlayer(config.blob.contactDamage);
        } else if (e.polarity !== this.blob.polarity) {
          this.killEnemy(e, true); // clean absorb
        } else {
          this.damagePlayer(config.blob.contactDamage);
        }
        return;
      }

      // despawn if shoved far off-screen (pulse / repel)
      if (dist > despawnR) e.alive = false;
    });
  }

  private damagePlayer(amount: number): void {
    if (this.blob.takeDamage(amount)) {
      this.shake = Math.max(this.shake, config.render.screenShakeBoss * 0.5);
      audio.hit();
    }
  }

  // clean=true when absorbed by the blob (kill reward); otherwise destroyed by chain/blast
  private killEnemy(e: Droplet, clean: boolean): void {
    if (!e.alive) return;
    e.alive = false;
    this.spawnSplat(e.x, e.y, e.isNeutral ? 'rgba(180,180,200,1)' : rimColor(e.polarity));
    if (clean) {
      this.charge.addKill();
      this.score.onKill(e.score);
      this.shake = Math.max(this.shake, config.render.screenShakeKill);
      audio.kill();
    }
    // kind-specific death effects
    if (e.kind === 'splitter' && e.splitInto > 0) {
      const childPol: Polarity = (e.polarity * -1) as Polarity; // opposite charge
      for (let i = 0; i < e.splitInto; i++) {
        const c = this.enemies.spawn();
        if (!c) break;
        const a = rng() * TAU;
        configureDroplet(c, 'basic', childPol, e.x + Math.cos(a) * 18, e.y + Math.sin(a) * 18);
        const sp = 60;
        c.vx = Math.cos(a) * sp;
        c.vy = Math.sin(a) * sp;
      }
    } else if (e.kind === 'bomb' && e.blastRadius > 0) {
      this.explodeBomb(e.x, e.y, e.blastRadius);
    }
  }

  private explodeBomb(x: number, y: number, radius: number): void {
    this.spawnSplat(x, y, 'rgba(255,210,120,1)', 28, true);
    this.shake = Math.max(this.shake, config.render.screenShakeBoss * 0.6);
    audio.kill();
    let chained = 0;
    this.enemies.forEachAlive((o) => {
      const d = Math.hypot(o.x - x, o.y - y);
      if (d < radius) {
        chained++;
        this.killEnemy(o, false);
      }
    });
    if (chained > 0) this.score.onChainKill(chained);
    // bomb also chips a nearby boss shield/body
    if (this.bossActive) this.boss.hitShield();
  }

  // enemy<->enemy high-speed collision (herding payoff / bombs)
  private onCollision(a: Droplet, b: Droplet, _rel: number): void {
    if (!a.alive || !b.alive) return;
    if (a.kind === 'bomb') {
      this.killEnemy(a, false);
      return;
    }
    if (b.kind === 'bomb') {
      this.killEnemy(b, false);
      return;
    }
    // two non-bombs slammed together by resonance -> chain kill both
    this.killEnemy(a, false);
    this.killEnemy(b, false);
    this.score.onChainKill(1);
    this.shake = Math.max(this.shake, config.render.screenShakeKill);
  }

  // ---------- boss ----------
  private updateBoss(dt: number): void {
    const alive = this.boss.update(dt, this.blob.polarity, (x, y, pol) => {
      const m = this.enemies.spawn();
      if (m) {
        configureDroplet(m, 'basic', pol, x, y);
        const a = Math.atan2(this.blob.cy - y, this.blob.cx - x);
        m.vx = Math.cos(a) * 40;
        m.vy = Math.sin(a) * 40;
      }
    });

    for (let i = 0; i < this.boss.bodies.length; i++) {
      const body = this.boss.bodies[i];
      if (!body.alive) continue;
      const dx = this.blob.cx - body.x;
      const dy = this.blob.cy - body.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;

      const opposite = body.polarity !== this.blob.polarity;
      // boss always creeps inward; opposite polarity pulls it faster
      const adv = opposite
        ? config.boss.approachSpeed + config.boss.pullAccel
        : config.boss.approachSpeed * config.boss.sameAdvanceScale;
      body.x += nx * adv * dt;
      body.y += ny * adv * dt;

      // contact resolution
      if (dist < body.radius + this.blob.radius(this.charge.value) + 6) {
        if (opposite) {
          // vulnerable: chip health, knock back
          this.boss.damage(i, this.blob.polarity, config.boss.contactDPS * dt);
          body.x -= nx * config.boss.knockback;
          body.y -= ny * config.boss.knockback;
          this.spawnSplat(body.x, body.y, rimColor(body.polarity), 4, true);
        } else {
          // wrong polarity — you take the hit
          this.damagePlayer(config.blob.contactDamage);
          body.x -= nx * config.boss.knockback;
          body.y -= ny * config.boss.knockback;
        }
      }

      // queen: enemies herded into her break the shield
      if (this.boss.kind === 'queen' && this.boss.shield > 0) {
        this.enemies.forEachAlive((en) => {
          if (Math.hypot(en.x - body.x, en.y - body.y) < body.radius + en.radius) {
            en.alive = false;
            this.boss.hitShield();
            this.spawnSplat(en.x, en.y, rimColor(en.polarity), 8, true);
          }
        });
      }
    }

    if (!alive) {
      this.bossActive = false;
      this.score.onBossKill();
      this.shake = config.render.screenShakeBoss;
      audio.boss();
      // celebratory splat
      for (let i = 0; i < 40; i++) {
        this.spawnSplat(
          this.w / 2 + randRange(rng, -60, 60),
          this.h * 0.62 + randRange(rng, -60, 60),
          '#d96cff',
          1,
          true
        );
      }
    }
  }

  // ---------- scoring helpers ----------
  private checkRingClear(): void {
    let pos = 0;
    let neg = 0;
    this.enemies.forEachAlive((e) => {
      if (e.isNeutral) return;
      if (e.polarity === POSITIVE) pos++;
      else neg++;
    });
    // a polarity that was a real ring (>=4) just hit zero -> bonus
    if (this.lastPosCount >= 4 && pos === 0) {
      this.score.onRingClear();
      this.shake = Math.max(this.shake, config.render.screenShakeKill * 1.5);
    }
    if (this.lastNegCount >= 4 && neg === 0) {
      this.score.onRingClear();
      this.shake = Math.max(this.shake, config.render.screenShakeKill * 1.5);
    }
    this.lastPosCount = pos;
    this.lastNegCount = neg;
  }

  private checkWaveProgress(): void {
    if (this.bossActive) return; // wave ends when boss dies
    if (this.spawn.isBossWave()) {
      // boss wave but boss already dead -> advance
      if (!this.bossActive) this.beginWave(this.spawn.wave + 1);
      return;
    }
    if (this.spawn.allSpawned() && this.enemies.activeCount === 0) {
      this.beginWave(this.spawn.wave + 1);
    }
  }

  // ---------- particles ----------
  private spawnSplat(x: number, y: number, color: string, count: number = config.particles.perKill, glow = true): void {
    for (let i = 0; i < count; i++) {
      const p = this.particles.spawn();
      if (!p) break;
      const a = rng() * TAU;
      const sp = randRange(rng, 40, config.particles.speed);
      p.reset(
        x,
        y,
        Math.cos(a) * sp,
        Math.sin(a) * sp,
        randRange(rng, config.particles.lifeMs * 0.5, config.particles.lifeMs) / 1000,
        randRange(rng, 1.5, 3.5),
        color,
        glow
      );
    }
  }

  private updateParticles(dt: number): void {
    this.particles.forEachAlive((p) => p.update(dt));
  }

  // ---------- render ----------
  private render(): void {
    const ctx = this.ctx;
    const charge = this.charge.value;
    ctx.clearRect(0, 0, this.w, this.h);

    // background is not shaken
    this.bg.draw(ctx, this.w, this.h, this.blob.cx, this.blob.cy, charge, this.blob.polarity);

    ctx.save();
    if (this.shake > 0) {
      ctx.translate(randRange(rng, -this.shake, this.shake), randRange(rng, -this.shake, this.shake));
    }

    const maxR = Math.max(this.w, this.h);
    this.fluid.drawFieldLines(ctx, this.blob, charge, this.perf.tier, maxR * 0.6);
    if (this.bossActive) this.fluid.drawBoss(ctx, this.boss, charge, this.perf.tier);
    this.fluid.drawDroplets(ctx, this.enemies, this.perf.tier);
    this.fluid.drawBlob(ctx, this.blob, charge, this.perf.tier);
    this.fluid.drawParticles(ctx, this.particles, this.perf.tier);
    this.fluid.drawPulse(ctx, this.pulse, this.blob);
    ctx.restore();

    // HUD + screens (not shaken)
    if (this.state === 'playing' || this.state === 'gameover') {
      this.ui.drawHUD(
        ctx,
        this.w,
        this.h,
        this.insets,
        this.blob,
        charge,
        this.pulse,
        this.score,
        this.input.chargeMs,
        this.spawn.wave
      );
      if (this.bossActive) this.ui.drawBossBar(ctx, this.w, this.insets, this.boss);
      if (this.waveBannerMs > 0 && this.state === 'playing') this.drawWaveBanner();
    }

    if (this.state === 'menu') this.ui.drawMenu(ctx, this.w, this.h, this.score.best);
    else if (this.state === 'gameover') {
      this.ui.drawGameOver(
        ctx,
        this.w,
        this.h,
        this.score,
        this.spawn.wave,
        this.newBest,
        this.board,
        leaderboardEnabled
      );
    }

    // tiny perf readout (corner)
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`${this.perf.fps}fps ${this.perf.tier}`, this.insets.left + 8, this.h - this.insets.bottom - 8);
    ctx.restore();
  }

  private drawWaveBanner(): void {
    const ctx = this.ctx;
    const a = clamp(this.waveBannerMs / 1400, 0, 1);
    ctx.save();
    ctx.globalAlpha = Math.min(1, a * 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = config.colors.text;
    ctx.font = '900 30px ui-sans-serif, system-ui, sans-serif';
    const label = this.spawn.isBossWave() ? 'BOSS' : `WAVE ${this.spawn.wave}`;
    ctx.fillText(label, this.w / 2, this.h * 0.42);
    ctx.restore();
  }

  // ---------- leaderboard name overlay (DOM, decoupled) ----------
  private buildNameOverlay(): void {
    if (!leaderboardEnabled) return;
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'position:fixed;left:50%;top:62%;transform:translateX(-50%);display:none;' +
      'gap:8px;align-items:center;z-index:10;font-family:ui-sans-serif,system-ui,sans-serif;';
    const input = document.createElement('input');
    input.maxLength = 16;
    input.placeholder = 'YOUR NAME';
    try {
      input.value = localStorage.getItem('magnet.name') || '';
    } catch {
      /* ignore */
    }
    input.style.cssText =
      'background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.2);' +
      'color:#fff;padding:10px 12px;border-radius:8px;font-size:16px;width:160px;text-align:center;';
    const btn = document.createElement('button');
    btn.textContent = 'SUBMIT';
    btn.style.cssText =
      'background:#ff7a3c;color:#111;border:0;padding:10px 14px;border-radius:8px;' +
      'font-weight:800;font-size:14px;';
    btn.onclick = async () => {
      const name = (input.value || 'ANON').trim().slice(0, 16) || 'ANON';
      try {
        localStorage.setItem('magnet.name', name);
      } catch {
        /* ignore */
      }
      btn.disabled = true;
      btn.textContent = '…';
      await submitScore({ name, score: this.score.total, wave: this.spawn.wave });
      this.board = await fetchTop(100);
      this.hideNameOverlay();
    };
    wrap.appendChild(input);
    wrap.appendChild(btn);
    document.body.appendChild(wrap);
    this.nameOverlay = wrap;
  }

  private showNameOverlay(): void {
    if (this.nameOverlay) this.nameOverlay.style.display = 'flex';
  }
  private hideNameOverlay(): void {
    if (this.nameOverlay) this.nameOverlay.style.display = 'none';
  }
}

// Read CSS safe-area insets so the HUD clears notches / home indicators.
function readInsets(): Insets {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;top:0;left:0;visibility:hidden;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) ' +
    'env(safe-area-inset-bottom) env(safe-area-inset-left);';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const insets: Insets = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  document.body.removeChild(probe);
  return insets;
}

// ---------- boot ----------
const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
game.start();

// register PWA offline shell (best-effort)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {});
  });
}
