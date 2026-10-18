# Status

**Current stage:** Stage 5 — Weapon system & full arsenal (complete, awaiting review)
**Next:** Stage 6 — Game flow: title, menu, player setup, sets
**Last updated:** 2026-10-18

See [PLAN.md](PLAN.md) for the full stage list. Update this file at the end of every work session
and at every stage boundary.

## Stage checklist

- [x] 0 — Project scaffold
- [x] 1 — Terrain & battlefield rendering
- [x] 2 — Tanks, aiming, ballistics (first playable)
- [x] 3 — Environment rules
- [x] 4 — HUD & full controls (desktop)
- [x] 5 — Weapon system & full arsenal (awaiting review)
- [ ] 6 — Game flow: title, menu, player setup, sets
- [ ] 7 — Economy, shop, guidance & shields
- [ ] 8 — Computer opponents
- [ ] 9 — Audio
- [ ] 10 — Touch & responsive layout
- [ ] 11 — Persistence
- [ ] 12 — Visual polish & backgrounds
- [ ] 13 — Balance, QA & release prep

## Current stage progress

Stage 5 is done: all 18 weapons behave distinctly, and tanks die in four styles.

- **Behaviors** (`ItemDef.behavior` in `items.ts`; dispatch in `src/sim/weapons.ts`):
  - Blast tiers (radius/damage): Grenade 8/110, Incinerator 20/150, Mark II 32/160, 20 Kt 62/220, 5 Mt 115/260. Big blasts get a flash and a shockwave ring.
  - Lead Ball: a harmless puff.
  - **Laser**: an instant straight beam with no gravity or wind. It spends energy equal to the power setting (minimum 100; otherwise the shot is refused with a toast). Range is 1.2 px per energy, boring through dirt costs 3×, and passing through a tank costs 120 and deals 40–100 damage depending on how fresh the beam is. It reflects off walls when they bounce and leaves a 4–5 px tunnel.
  - **CRIs**: a breadth-first burn through connected ground, seeded around the impact, with a pixel budget (4/D 2.5k, 8/ND 4k, 8/D 7k, 20/ND 12k, 20/D 30k). "D" spreads to 8 neighbors (p 0.6, 220 cells/tick) into smooth caverns; "ND" to 4 neighbors (p 0.52, 90/tick) into lacy, ragged holes. Tanks touching the burn take up to 40 damage. The burn glows while active.
  - **Sonic Blaster**: a small blast, expanding rings, and a forced collapse of all loose ground (even at crumble 0%).
  - **Dirt balls**: radius 18/28/40/56 balls of dirt that grow over 12 ticks and can bury tanks.
  - **Explosive Dirt**: 48 clods sprayed upward that freeze into floating dirt when they run out of steam, or pile up where they land. Crumble then decides whether they fall.
  - Soft weapons (CRI, sonic, explosive dirt) add a small seed blast on impact.
- **Duds**: explosive shells hitting a tank may bore through instead (25 damage, "DUD!") and keep flying. The chance is 2.5%, or 12% for very fast impacts (speed > 7.2 px/tick, roughly power > 900).
- **Death styles** (picked per death): standard 55% (final blast 22/80 plus 16 debris streamers), dirt 15% (buries the spot), fade 15% (vanishes quietly), meltdown 15% (pulses for 50 ticks, then a 46/120 blast).
- New option **Explosions Kill** (default on, also on the F2 panel and `?kills=0`): debris streamers deal 8 damage to tanks they hit. Final blasts always hurt.
- **Effects engine** (`src/sim/effects.ts`): explosions, reactions, particles, beams, dirt fills, sonic waves and dying tanks. The round's `exploding` phase became `effects` and lasts while anything is active. `Round` implements a narrow `World` interface (`src/sim/world.ts`) that weapons and effects operate on, so they're unit-testable without a full round.
- `?arsenal`: every player gets 20 of each weapon plus 5000 laser energy.
- Fix: input events from several key presses in one tick could be dropped after an overlay closed. Now only the rest of the consuming key press is skipped.
- Tests: 117 unit tests (new: 28 weapon tests covering blast/dirt tiers, harmless lead, CRI budget, termination and determinism, sonic forced collapse, explosive dirt, laser tunnel/pierce/range/reflect/energy, duds on/off/never-for-dirt, all 4 death styles, debris versus the explosions-kill option) + 9 e2e tests (new: arsenal with CRI and laser resolving, and fast key sequences around overlays). I checked CRI D/ND, laser, nuke and explosive dirt visually with headless screenshots.

## Implementation notes

- **TypeScript pinned to ~6.0**: TS 7 (the native port) is out, but typescript-eslint 8.71 supports only `<6.1`. Revisit when typescript-eslint supports 7.
- `noUncheckedIndexedAccess` is deliberately off: it makes typed-array pixel code noisy.
- No `const enum` (it doesn't mix with `isolatedModules` and esbuild). Use the `as const` object + type pattern, as `Material` does.
- The RNG test pins the first 3 outputs for seed 1991. If the algorithm changes, saves and replays break, so bump the save version.
- Terrain colors are not stored. They come from position (depth band + hash) at render time, so dirt added by weapons automatically matches.
- The theme choice uses its own RNG stream (`seed ^ 0x5eed`) so presentation never consumes sim randomness. In Stage 6 the theme becomes part of round setup.
- `window.__tankwars` is a debug handle (`ticks`, `phase`, `round`, `overlay`) used by e2e tests and the console. URL params: `?seed=N`, `?players=N`, `?lab`, plus the option params above.
- Commands are queued by input and applied at the start of the next sim tick, so e2e tests must poll after key presses.
- Physics constants (in `src/sim/constants.ts`): gravity 0.05 px/tick², speed = power × 0.008, wind accel = wind × 0.00012, max speed 40 px/tick per axis. Stage 13 tunes everything.
- All weapon numbers live in `items.ts` (behaviors) and `weapons.ts`/`effects.ts` (laser, dud, death and CRI constants). They're first-pass values for Stage 13 to tune against the original.
- Effects use the round's RNG (CRI spread, clods, debris, death style, duds), so everything stays deterministic. Test-only overrides: `RoundConfig.dudChance` and `deathStyle`.
- **Key bindings differ from the original's Ctrl combos** (Ctrl-P/S/Q/M collide with the browser's print, save, quit and so on). They are single keys: P/Esc pause, S sound, Q quit, K mass kill, and the original's Alt fine-step is now Shift.
- Input events are processed in order within a tick. Each key press is a raw `key` event followed by its mapping. An overlay opened mid-tick receives the following events, and when it consumes a press, only the rest of _that press_ is skipped (one Esc both closes and maps to pause).
- Sound on/off is a UI flag only until Stage 9.
- Deaths only resolve after a shot (during settling), so zeroing health by hand mid-aim does nothing until someone fires.
- **Crumble interpretation:** crumble % is a _per-shot_ chance that all loose ground collapses, not a per-pixel or per-column chance. This matches the manual ("how often loose ground will fall") and gives the Sonic Blaster a clear job. Rolling always consumes RNG, so determinism holds.
- Dirt falling onto a tank passes through it (tanks aren't in the material grid), so a tank can end up buried. Shots still hit it, because tanks are checked before terrain.
- Sim options apply when a round is created, so changes in the F2 panel affect the next round; visible shot and trail apply immediately.
- The angle is clamped to 0–180; the original wrapped around instead. I clamped deliberately because it's less confusing.
- The Vitest config lives in `vite.config.ts` (imported from `vitest/config`). Unit tests are in `tests/`, e2e tests in `e2e/`.
- `.claude/launch.json` defines the `dev` preview server (port 5173). Playwright uses `vite preview` on 4173.

## Playtest script for current stage

1. `npm run dev`, then open http://localhost:5173/?arsenal&players=3 (try `&crumble=0` and `&walls=on`).
2. Arm each weapon from the strip (or with Tab) and fire it at the ground between tanks:
   - Grenade → Incinerator → Mark II → 20 Kt → 5 Mt: growing craters; the nukes flash with a shockwave.
   - CRI 4/D, 8/D, 20/D: glowing smooth caverns. CRI 8/ND, 20/ND: ragged, lacy holes. Tanks left on overhangs fall if crumble or sonic drops them.
   - Laser: set power (energy spent) and fire. A beam tunnels through hills and pierces tanks; with walls on it bounces. Below 100 power it refuses.
   - Sonic Blaster with `crumble=0`: all overhangs collapse anyway.
   - Dirt balls bury things; Explosive Dirt leaves floating clods (with crumble 100 they fall).
3. Kill tanks to see the death styles: explosion with burning debris, burial in dirt, fade-out, or a pulsing meltdown with a big blast. `?kills=0` makes the debris harmless.
4. Rarely, a shell hitting a tank says "DUD!" and flies through. Point-blank full-power shots dud more often.

## Known issues

- The plateaus style can still leave an occasional 3–4 px wide spike (tank pads are flattened, so tanks are unaffected).
- While the desktop app's browser pane is hidden, rAF stops entirely. That's a pane artifact, not a game bug. Use headless Playwright for visual checks (see WORKING_NOTES).
- Column collapse can leave sheer vertical walls at the edges of a collapsed area. That's inherent to the column model and fits the original's look.
- The dev FPS overlay covers the top-left of the HUD in dev builds (toggle with F3).
- H/V guidance and shields show in the HUD but do nothing until Stage 7.
- A CRI 20/D on a full field burns about 30k pixels in roughly 2.3 s. It's fine on desktop; check phones in Stage 10/13.
- Tanks buried by dirt can still fire, but their shells hit the dirt right away and hurt them, which is deliberate ("death by dirt").
- The DOM dev panel (F2) still uses a browser font; it gets replaced by the real menu in Stage 6.
- A fast drag in the lab carves at sampled pointer positions only (gaps possible). It's a debug tool, so this is fine.
