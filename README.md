# MAGNET

A one-thumb arcade shooter. You are a blob of ferrofluid fixed at the center of
the screen. Enemies swarm in from every direction. **TAP** flips your polarity
(+ / –) — opposite-charge enemies are pulled in and destroyed, same-charge are
shoved away. **HOLD** unleashes a radial pulse that clears the screen. Survive
escalating waves, beat a boss every 5th wave, chase a stylish high score.

TypeScript + Vite + Canvas2D. No framework. Mobile-first, portrait, PWA-ready.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production build to dist/
npm run preview  # serve the production build
```

## Controls

| | Mobile | Desktop |
|---|---|---|
| **Flip polarity** | tap | click / Space (tap) |
| **Pulse** (radial shove) | hold | hold click / Space |

A press shorter than `config.input.holdThresholdMs` flips; longer charges a
pulse that fires on release (strength scales with hold time **and** charge,
and firing burns charge). All input funnels through `flip()` / `pulse()` in
`systems/input.ts`, so mobile and desktop share one path.

## The loop

`flip → kills → charge → bigger field → resonance herding → precise flips`.

- **Charge** (the throttle): each kill raises it, it decays over time, and it
  scales field radius + strength + the blob's spike amplitude. High charge
  clears fast but yanks opposites in violently.
- **Enemy↔enemy forces** (resonance): enemies magnetize each other. Scatter a
  ring with a flip, flip back to slam them into chain collisions. Uniform
  spatial grid, capped radius — never O(n²).
- **Pulse** (panic + skill): hold to charge, release to shove everything out.
  Cooldown ring around the blob. The only way to clear **neutral** enemies.

## Enemy types

Introduced progressively across waves: `basic`, `splitter` (splits into the
opposite charge on death), `heavy` (only pulled in at high charge), `charger`
(matches your polarity to always be repelled — pulse it), `bomb` (herd it into
others to chain-explode), `neutral` (immune to the field — pulse only).

## Bosses (every 5th wave)

Polarity puzzles, not bullet sponges. They cycle:
- **The Core** — flips its own polarity on a timer; only vulnerable when your
  charge is opposite its current state.
- **The Twins** — two linked opposite-charge bodies; down both within the
  revive window or they bring each other back.
- **The Swarm Queen** — shielded until herded minions slam into her, then strike.

## Tuning

Every tunable lives in `src/config.ts` — forces, radii, spawn curves, colors,
scoring, performance thresholds. Nothing else needs editing to balance.

## Performance

- Object pooling, hard caps on droplets + particles, zero per-frame allocation
  in the hot loop.
- Ferrofluid quality auto-degrades HIGH → MED → LOW based on measured frame
  time (`systems/perf.ts`). `devicePixelRatio` capped at 2.

## Leaderboard (optional, fully decoupled)

Global top-100 via Supabase REST. Set `VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` (see `.env.example`) to enable. With them unset the
game is 100% playable — the board is simply disabled and the local best score
is used. A backend failure never blocks gameplay (`systems/leaderboard.ts`
degrades to no-ops).

## Structure

```
src/
  main.ts                 loop, state machine (menu/play/boss/gameover)
  config.ts               ALL tunables
  entities/               Blob, Droplet, Boss, Particle
  systems/                input, magnetism, spawn, charge, pulse, score,
                          leaderboard, perf, audio
  render/                 ferrofluid, background, ui
  utils/                  math, pool, spatialGrid
```
