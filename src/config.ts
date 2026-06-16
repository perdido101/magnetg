// MAGNET — ALL tunables live here. Forces, radii, spawn, colors, curves.
// Touch nothing else to balance the game.

export type Polarity = 1 | -1; // +1 = POSITIVE, -1 = NEGATIVE

export const POSITIVE: Polarity = 1;
export const NEGATIVE: Polarity = -1;

export const config = {
  // ---- INPUT ----
  input: {
    holdThresholdMs: 180, // press longer than this == hold/pulse, shorter == flip
  },

  // ---- BLOB (the player, fixed at center) ----
  blob: {
    baseRadius: 30, // logical px at charge 0
    coreKillRadius: 26, // contact distance at which enemies resolve against blob
    maxHealth: 100,
    contactDamage: 22, // damage when a same-charge / dangerous enemy hits core
    invulnMsOnHit: 700, // i-frames after taking damage
    vertices: 34, // deformable ring resolution
    spring: 140, // vertex spring-back stiffness
    damping: 9, // vertex velocity damping
    maxSpikeAmplitude: 46, // how far a vertex can be pushed at full charge
    spikeReach: 240, // distance over which nearby enemies deform the surface
  },

  // ---- MAGNETISM (blob <-> enemy) ----
  magnetism: {
    baseStrength: 26000, // inverse-square numerator at charge 0
    chargeStrengthBonus: 64000, // added * charge
    minDistance: 34, // clamp to avoid singularity near center
    baseRadius: 320, // field reach at charge 0
    chargeRadiusBonus: 360, // added * charge
    repelMultiplier: 1.15, // same-charge push relative to opposite pull
    maxEnemySpeed: 900, // px/s clamp
  },

  // ---- ENEMY <-> ENEMY (resonance / herding) ----
  resonance: {
    enabled: true,
    strength: 5200, // inverse-square numerator between enemies
    interactionRadius: 130, // capped neighbor distance (spatial grid cell sizing)
    minDistance: 14,
    collisionChainSpeed: 240, // relative speed above which a collision can chain-kill
  },

  // ---- CHARGE (the throttle) ----
  charge: {
    perKill: 0.085, // charge gained per kill
    decayPerSec: 0.06, // passive bleed
    max: 1,
    // charge curve pressure: spawn ramp references this so high charge => more pressure
  },

  // ---- PULSE (hold to charge, release to fire) ----
  pulse: {
    minHoldMs: 180, // matches input hold threshold
    fullChargeMs: 650, // hold this long for max-power pulse
    cooldownMs: 4200, // ring refill time after firing
    baseStrength: 520, // outward impulse (velocity) at zero charge scaling
    chargeStrengthBonus: 520, // extra impulse * current player charge
    radius: 520, // affected radius
    chargeCost: 0.45, // player charge burned when pulse fires (trade-off)
    knockKills: false, // pulse shoves, doesn't directly kill (neutrals just cleared off-screen)
  },

  // ---- SPAWNING & WAVES ----
  spawn: {
    spawnMarginPx: 60, // beyond screen edge enemies appear
    baseInterval: 1.15, // seconds between spawns, wave 1
    intervalRampPerWave: 0.045, // interval shrinks each wave
    minInterval: 0.28,
    baseDriftSpeed: 46, // inward drift px/s, wave 1
    driftRampPerWave: 5.5,
    baseBatch: 1, // enemies per spawn tick, wave 1
    batchEveryWaves: 3, // +1 batch every N waves
    enemiesPerWaveBase: 8, // kills (or escapes) to clear a wave
    enemiesPerWaveRamp: 3,
    maxDroplets: 220, // hard cap (pool size)
    bossEveryWaves: 5,
  },

  // ---- ENEMY TYPES (behavior table keyed by kind) ----
  // health / score / radius / firstWave it can appear
  enemies: {
    basic: { radius: 12, health: 1, score: 100, firstWave: 1 },
    splitter: { radius: 15, health: 1, score: 150, firstWave: 3, splitInto: 2 },
    heavy: { radius: 20, health: 1, score: 250, firstWave: 6, chargeToPull: 0.55 },
    charger: { radius: 13, health: 1, score: 220, firstWave: 8 },
    bomb: { radius: 16, health: 1, score: 200, firstWave: 10, blastRadius: 120 },
    neutral: { radius: 14, health: 1, score: 180, firstWave: 12 },
  },

  // ---- BOSSES ----
  boss: {
    baseHealth: 28, // hits required
    healthPerCycle: 10, // +health each boss cycle
    radius: 64,
    approachSpeed: 18,
    coreFlipPeriodMs: 3200, // The Core polarity timer
    twinsReviveMs: 2600, // The Twins revive window
    queenRingEveryMs: 2600, // Swarm Queen spawn cadence
    queenRingCount: 8,
    contactDPS: 9, // damage dealt to boss per second while pulled into contact
    pullAccel: 70, // extra inward accel when blob is OPPOSITE the body (attracted)
    sameAdvanceScale: 0.45, // how much the boss still creeps in while repelled
    knockback: 26, // px the body recoils after a damage tick / contact
    score: 5000,
  },

  // ---- SCORING (style) ----
  score: {
    base: 100,
    noFlipStep: 0.15, // multiplier growth per kill without flipping
    noFlipMaxMult: 4,
    chainBonus: 250, // per herding chain-kill
    ringClearBonus: 1200, // clear all of one polarity at once
    bossBonus: 5000,
    comboWindowMs: 2600, // time before no-flip combo cools off visually
  },

  // ---- PARTICLES ----
  particles: {
    max: 600,
    perKill: 14,
    lifeMs: 620,
    speed: 220,
  },

  // ---- RENDER / FEEL ----
  render: {
    maxDpr: 2,
    screenShakeKill: 4,
    screenShakeBoss: 14,
    screenShakeDecay: 9,
    fieldLines: 26, // radial field lines from blob
  },

  // ---- COLORS (wet obsidian + polarity rim) ----
  colors: {
    bg0: '#06060a',
    bg1: '#0b0b12',
    bgShimmer: 'rgba(40,60,90,0.05)',
    fluidDark: '#040406',
    fluidMid: '#15151c',
    specular: 'rgba(200,215,255,0.85)',
    posRim: '#ff7a3c', // POSITIVE warm amber/red
    posGlow: 'rgba(255,120,60,0.55)',
    negRim: '#3ad6ff', // NEGATIVE cold cyan
    negGlow: 'rgba(60,200,255,0.55)',
    health: '#ff5066',
    pulseRing: '#cfe3ff',
    text: '#e8ecff',
    textDim: 'rgba(232,236,255,0.5)',
  },

  // ---- PERFORMANCE TIERS (auto-picked by measured frame time) ----
  perf: {
    // ms-per-frame thresholds (rolling avg) to step DOWN a tier
    medThresholdMs: 22, // > this for a while -> drop HIGH to MED
    lowThresholdMs: 30, // > this for a while -> drop MED to LOW
    sampleWindow: 90, // frames in the rolling window
  },
} as const;

export type Config = typeof config;

// Polarity color helpers (used widely).
export function rimColor(p: Polarity): string {
  return p === POSITIVE ? config.colors.posRim : config.colors.negRim;
}
export function glowColor(p: Polarity): string {
  return p === POSITIVE ? config.colors.posGlow : config.colors.negGlow;
}
