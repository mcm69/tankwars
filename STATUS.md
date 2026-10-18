# Status

**Current stage:** Stage 3 — Environment rules (complete, awaiting review)
**Next:** Stage 4 — HUD & full controls (desktop)
**Last updated:** 2026-10-18

See [PLAN.md](PLAN.md) for the full stage list. Update this file at the end of every work session
and at every stage boundary.

## Stage checklist

- [x] 0 — Project scaffold
- [x] 1 — Terrain & battlefield rendering
- [x] 2 — Tanks, aiming, ballistics (first playable)
- [x] 3 — Environment rules (awaiting review)
- [ ] 4 — HUD & full controls (desktop)
- [ ] 5 — Weapon system & full arsenal
- [ ] 6 — Game flow: title, menu, player setup, sets
- [ ] 7 — Economy, shop, guidance & shields
- [ ] 8 — Computer opponents
- [ ] 9 — Audio
- [ ] 10 — Touch & responsive layout
- [ ] 11 — Persistence
- [ ] 12 — Visual polish & backgrounds
- [ ] 13 — Balance, QA & release prep

## Current stage progress

Stage 3 is done: every environmental option works and can be toggled from a dev panel (**F2**) or URL parameters.

- `src/sim/options.ts`: `GameOptions` (wind level, wall mode, crumble %, tanks fall, visible shot, shot trail), using the original's defaults. Wind profiles per level: none, low ≤30, standard mostly ≤100 with 6% gusts up to 800, high, and gale with gusts past 10,000. `random` picks a level, or a wall setting, per round.
- Walls (`physics.ts`): **on** reflects off the sides and ceiling; **off** lets shots leave and come back, but drops a shot at once if it's off a side, moving away, with no wind to return it. Speed per axis is capped at 40 px/tick so gale shots stay cheap to simulate.
- Crumbling (`src/sim/crumble.ts`): column "sand" collapse that moves every floating run of dirt down 1 px per pass, accelerating to 6 passes per tick and tracking active columns. After a shot's explosions finish, the round rolls `crumble%`; on success it enters a new `crumbling` phase, and tanks ride the collapsing ground down.
- Falling tanks (`round.ts`): damage is (distance − 4) × 0.5 on landing. The initial drop never hurts. With "tanks fall" off, tanks hover.
- Presentation: a persistent `TrailLayer` in a dimmed player color (cleared each round); the visible-shot option hides the shell and its **tracking markers** (edge arrows plus a distance bar when the shell is above or beside the field); a magenta **R** badge and brighter border when walls bounce; the wind level is shown under the wind.
- `src/ui/dev-options.ts`: temporary F2 options panel (the real menu comes in Stage 6). `src/ui/options-params.ts`: URL params `wind=`, `walls=`, `crumble=`, `fall=`, `visible=`, `trail=`.
- Tests: 66 unit tests (new: wind levels, walls on/off/return, crumble mechanics plus 0%/100% in a real round, fall damage on/off, URL params) + 4 e2e tests (new: F2 panel); all pass. I checked bounce + trail and crumble + fall visually with headless Playwright screenshots.

## Implementation notes

- **TypeScript pinned to ~6.0**: TS 7 (the native port) is out, but typescript-eslint 8.71 supports only `<6.1`. Revisit when typescript-eslint supports 7.
- `noUncheckedIndexedAccess` is deliberately off: it makes typed-array pixel code noisy.
- No `const enum` (it doesn't mix with `isolatedModules` and esbuild). Use the `as const` object + type pattern, as `Material` does.
- The RNG test pins the first 3 outputs for seed 1991. If the algorithm changes, saves and replays break, so bump the save version.
- Terrain colors are not stored. They come from position (depth band + hash) at render time, so dirt added by weapons automatically matches.
- The theme choice uses its own RNG stream (`seed ^ 0x5eed`) so presentation never consumes sim randomness. In Stage 6 the theme becomes part of round setup.
- `window.__tankwars` is a debug handle (`ticks`, `phase`, `round`) used by e2e tests and the console. URL params: `?seed=N`, `?players=N`, `?lab`, plus the option params above.
- Commands are queued by input and applied at the start of the next sim tick, so e2e tests must poll after key presses.
- Physics constants (in `src/sim/constants.ts`): gravity 0.05 px/tick², speed = power × 0.008, wind accel = wind × 0.00012, max speed 40 px/tick per axis. Stage 13 tunes everything.
- Stage 2 has a single weapon, `SHELL` (radius 20, damage 150, roughly an Incinerator), and `DEATH_BLAST` (radius 22, damage 80). Both get replaced by the weapon registry in Stage 5.
- Deaths only resolve after a shot (during settling), so zeroing health by hand mid-aim does nothing until someone fires.
- **Crumble interpretation:** crumble % is a _per-shot_ chance that all loose ground collapses, not a per-pixel or per-column chance. This matches the manual ("how often loose ground will fall") and gives the Sonic Blaster a clear job. Rolling always consumes RNG, so determinism holds.
- Dirt falling onto a tank passes through it (tanks aren't in the material grid), so a tank can end up buried. Shots still hit it, because tanks are checked before terrain.
- Sim options apply when a round is created, so changes in the F2 panel affect the next round; visible shot and trail apply immediately.
- The angle is clamped to 0–180; the original wrapped around instead. I clamped deliberately because it's less confusing.
- The Vitest config lives in `vite.config.ts` (imported from `vitest/config`). Unit tests are in `tests/`, e2e tests in `e2e/`.
- `.claude/launch.json` defines the `dev` preview server (port 5173). Playwright uses `vite preview` on 4173.

## Playtest script for current stage

1. `npm run dev`, then open http://localhost:5173 and press **F2** for options.
2. Walls: try `?walls=on&wind=low` with a steep full-power shot. It bounces off the ceiling and sides and the R badge shows. With `?walls=off&wind=none`, a shot heading off a side is dropped right away.
3. Wind: `?wind=gale` gives absurd gusts; `?wind=none` gives a dead-straight parabola. Compare with the trail.
4. Crumble: `?crumble=100`, then shoot into a cliff face. The overhang collapses with animation, and tanks on it ride down and take fall damage. `?crumble=0` leaves overhangs floating.
5. `?fall=0`: tanks hover over craters. `?visible=0`: the shell and tracking markers are hidden (the trail still draws unless `trail=0`).

## Previous stage playtest (Stage 2)

1. `npm run dev`, then open http://localhost:5173 (try `?players=4` and `?seed=7`).
2. Watch the tanks drop in. The HUD shows whose turn it is, and a bobbing marker sits above that tank.
3. Use ←/→ to aim (tap = 1°, hold = fast), ↑/↓ for power, PgUp/PgDn for ±100, `I` to flip, and Space to fire. Hold Shift for single steps.
4. Shells arc under gravity and drift with the wind (shown in the HUD), carve craters and show damage numbers. Tanks over craters drop to the new ground.
5. Kill everyone else, or yourself (power 0, straight up), to end the round, then press Space or Enter for a new one.

## Known issues

- The plateaus style can still leave an occasional 3–4 px wide spike (tank pads are flattened, so tanks are unaffected).
- The placeholder HUD uses the browser's monospace font; Stage 4 brings a real pixel font and panel.
- While the desktop app's browser pane is hidden, rAF stops entirely. That's a pane artifact, not a game bug. Use headless Playwright for visual checks (see WORKING_NOTES).
- Column collapse can leave sheer vertical walls at the edges of a collapsed area. That's inherent to the column model and fits the original's look.
- The dev FPS overlay covers the top-left of the HUD in dev builds (toggle with F3).
- A fast drag in the lab carves at sampled pointer positions only (gaps possible). It's a debug tool, so this is fine.
