# Status

**Current stage:** Stage 2 — Tanks, aiming, ballistics (complete, awaiting review)
**Next:** Stage 3 — Environment rules
**Last updated:** 2026-10-18

See [PLAN.md](PLAN.md) for the full stage list. Update this file at the end of every work session
and at every stage boundary.

## Stage checklist

- [x] 0 — Project scaffold
- [x] 1 — Terrain & battlefield rendering
- [x] 2 — Tanks, aiming, ballistics (first playable, awaiting review)
- [ ] 3 — Environment rules
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

Stage 2 is done: the game is playable as a hot-seat battle for 2–10 players (`?players=N`).

- `src/sim/tank.ts`: tank model with an internal angle of 0–180 (90 = up), shown to players as 0–90 plus a facing arrow. Power is capped at health × 10. Also hitbox, barrel tip and ground-support check.
- `src/sim/physics.ts`: projectile launch and a fixed-tick step (semi-implicit Euler, gravity + wind) swept in ≤1 px sub-steps. It hits terrain, tanks or the field floor; a shot is lost once it's a full field width off either side.
- `src/sim/damage.ts`: radial blast damage with linear falloff out to radius + tank half-width.
- `src/sim/round.ts`: `Round` state machine: `dropping → aiming → flying → exploding → settling → … → roundOver`. Tanks are placed in random order across spread slots on flattened pads and drop in. The first player is random, then turns go left to right, skipping the dead. Dying tanks resolve one at a time; each final blast can chain. Commands: `aim`, `power`, `flip`, `fire`. Sim events (`turn`, `fire`, `explode`, `tankHit`, `tankDied`, `roundOver`) are drained by presentation.
- `src/input/keyboard.ts`: keys → per-tick commands. A tap is 1 unit; holding repeats after 15 ticks, with power accelerating ×4 then ×10. Shift disables repeat. PgUp/PgDn ±100, `I` flip, Space/Enter fire.
- Rendering: procedural 15×6 tank sprites in 10 player colors (`tank-sprite.ts`), a 2-px barrel, a turn marker, the shell, pixel-circle fireballs, floating damage numbers, a placeholder HUD and a round-over banner (`battle-renderer.ts`, `pixels.ts`).
- `src/scenes/battle.ts` is the default scene; the terrain lab moved to `?lab`.
- Tests: 48 unit tests (new: physics, damage, round) + 3 e2e tests (new: a full keyboard round from aim to round over to a new round); all pass. I also checked a 4-player round in the browser pane.

## Implementation notes

- **TypeScript pinned to ~6.0**: TS 7 (the native port) is out, but typescript-eslint 8.71 supports only `<6.1`. Revisit when typescript-eslint supports 7.
- `noUncheckedIndexedAccess` is deliberately off: it makes typed-array pixel code noisy.
- No `const enum` (it doesn't mix with `isolatedModules` and esbuild). Use the `as const` object + type pattern, as `Material` does.
- The RNG test pins the first 3 outputs for seed 1991. If the algorithm changes, saves and replays break, so bump the save version.
- Terrain colors are not stored. They come from position (depth band + hash) at render time, so dirt added by weapons automatically matches.
- The theme choice uses its own RNG stream (`seed ^ 0x5eed`) so presentation never consumes sim randomness. In Stage 6 the theme becomes part of round setup.
- `window.__tankwars` is a debug handle (`ticks`, `phase`, `round`) used by e2e tests and the console. URL params: `?seed=N`, `?players=N`, `?lab`.
- Commands are queued by input and applied at the start of the next sim tick, so e2e tests must poll after key presses.
- Stage 2 physics constants (in `src/sim/constants.ts`): gravity 0.05 px/tick², speed = power × 0.008, wind accel = wind × 0.00012, and a temporary random wind of ±60. Stage 3 adds wind levels and gusts; Stage 13 tunes everything.
- Stage 2 has a single weapon, `SHELL` (radius 20, damage 150, roughly an Incinerator), and `DEATH_BLAST` (radius 22, damage 80). Both get replaced by the weapon registry in Stage 5.
- Deaths only resolve after a shot (during settling), so zeroing health by hand mid-aim does nothing until someone fires.
- Unsupported tanks fall without damage for now (Stage 3 adds fall damage and the Tanks Fall option).
- The angle is clamped to 0–180; the original wrapped around instead. I clamped deliberately because it's less confusing.
- The Vitest config lives in `vite.config.ts` (imported from `vitest/config`). Unit tests are in `tests/`, e2e tests in `e2e/`.
- `.claude/launch.json` defines the `dev` preview server (port 5173). Playwright uses `vite preview` on 4173.

## Playtest script for current stage

1. `npm run dev`, then open http://localhost:5173 (try `?players=4` and `?seed=7`).
2. Watch the tanks drop in. The HUD shows whose turn it is, and a bobbing marker sits above that tank.
3. Use ←/→ to aim (tap = 1°, hold = fast), ↑/↓ for power, PgUp/PgDn for ±100, `I` to flip, and Space to fire. Hold Shift for single steps.
4. Shells arc under gravity and drift with the wind (shown in the HUD), carve craters and show damage numbers. Tanks over craters drop to the new ground.
5. Kill everyone else, or yourself (power 0, straight up), to end the round, then press Space or Enter for a new one.

## Known issues

- The plateaus style can still leave an occasional 3–4 px wide spike (tank pads are flattened, so tanks are unaffected).
- The placeholder HUD uses the browser's monospace font; Stage 4 brings a real pixel font and panel.
- While the desktop app's browser pane is hidden, rAF is throttled and the game crawls. That's a pane artifact, not a game bug.
- A fast drag in the lab carves at sampled pointer positions only (gaps possible). It's a debug tool, so this is fine.
