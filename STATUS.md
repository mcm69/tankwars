# Status

**Current stage:** Stage 7 — Economy, shop, guidance & shields (complete, awaiting review)
**Next:** Stage 8 — Computer opponents
**Last updated:** 2026-10-18

See [PLAN.md](PLAN.md) for the full stage list. Update this file at the end of every work session
and at every stage boundary.

## Stage checklist

- [x] 0 — Project scaffold
- [x] 1 — Terrain & battlefield rendering
- [x] 2 — Tanks, aiming, ballistics (first playable)
- [x] 3 — Environment rules
- [x] 4 — HUD & full controls (desktop)
- [x] 5 — Weapon system & full arsenal
- [x] 6 — Game flow: title, menu, player setup, sets
- [x] 7 — Economy, shop, guidance & shields (awaiting review)
- [ ] 8 — Computer opponents
- [ ] 9 — Audio
- [ ] 10 — Touch & responsive layout
- [ ] 11 — Persistence
- [ ] 12 — Visual polish & backgrounds
- [ ] 13 — Balance, QA & release prep

## Current stage progress

Stage 7 is done: money matters, and guidance and shields work.

- **Economy** (`src/game/economy.ts`): each game pays $500 base + $10 per point of round score (score itself is still damage − self-damage + 150/kill + 300/win). Money is shown on the status screen. Twenty items are for sale (all but Lead Balls and Grenades), at the original's prices and bundles. Cart and purchase logic is pure and tested.
- **Shop** (`src/scenes/shop.ts`): after each status screen (not after the last game), every human who can afford the cheapest item ($3,000) shops in turn. Two columns of items, each with icon, bundle and price, what you already have, a −/+ quantity, and the original's red/dark affordability light. Unallocated and total money show at the top; Purchase buys and stays, Done buys and leaves, Esc leaves without buying the selection. Keys: arrows, +/−, P, D, Esc; mouse: −/+, row click (right-click removes), wheel. Input is ignored for 15 ticks on entry so a stray key can't buy anything. Computers don't shop yet (Stage 8).
- **Shields** (`absorbWithShields` in `round.ts`): they're automatic while you have units. The Energy Shield soaks blasts, debris, lasers, reactions and duds at 5 units per point (1000 units ≈ 200 damage); the Inertia Dampener soaks fall damage one-for-one. A cyan bubble shows on shielded tanks and flashes on absorb, with "shield N" / "damper N" floaters. `World.damage` takes a `kind` (`blast` | `fall`).
- **Guidance** (`physics.ts`): `setGuidance` / `clearGuidance` commands; firing spends one unit and disarms. **Herb's (H)** locks onto the target's column when the shell passes over it and drops straight down (wind no longer applies). **Vick's (V)** locks onto the target's height when the descending shell reaches it and flies level at the target (no gravity). Neither helps if the shell never crosses the line. Lasers ignore guidance.
- **Target picker**: H/V (keys or strip slots) opens a picker that starts on the nearest enemy; ←→ cycle, Enter confirm, Esc cancel, or click a tank. Pressing H/V again disarms. The armed slot turns red and a crosshair marks the target.
- `?money=N` gives starting money in `?play` sets; `?arsenal` now also includes guidance and shields.
- Tests: 136 unit tests (new: income, buyable list, cart and budget, purchase bundles and refusals, set income; both shields standalone and in a round; H drops onto the column, V flies level into the target, guidance validation, spending and disarming) + 13 e2e tests (new: shop purchase carries into the next game; H picker arms and disarms). The e2e helpers (`e2e/helpers.ts`) are now race-free around screen transitions. I checked the shop, picker and shields with headless screenshots.

## Implementation notes

- **TypeScript pinned to ~6.0**: TS 7 (the native port) is out, but typescript-eslint 8.71 supports only `<6.1`. Revisit when typescript-eslint supports 7.
- `noUncheckedIndexedAccess` is deliberately off: it makes typed-array pixel code noisy.
- No `const enum` (it doesn't mix with `isolatedModules` and esbuild). Use the `as const` object + type pattern, as `Material` does.
- The RNG test pins the first 3 outputs for seed 1991. If the algorithm changes, saves and replays break, so bump the save version.
- Terrain colors are not stored. They come from position (depth band + hash) at render time, so dirt added by weapons automatically matches.
- The theme choice uses its own RNG stream (`seed ^ 0x5eed`) so presentation never consumes sim randomness. In Stage 6 the theme becomes part of round setup.
- `window.__tankwars` is a debug handle (`ticks`, `scene`, `phase`, `round`, `overlay`, `app`) used by e2e tests and the console. `/` opens the title; `?play` jumps into a set (see above); `?lab` opens the terrain lab.
- **Menus are canvas-rendered** (PLAN §2.1 item 6 revised): the widget kit is in `src/ui/widgets.ts`, and `TextEntry` (an off-screen input) handles names. Keys typed before the field takes focus (same tick) are fed in by the scene.
- Settings (`src/game/settings.ts`) = sim `GameOptions` + sound, fly sound, background, background speed, games per set, players, computers buy. They live in memory for now (persistence is Stage 11). Background, speed, sound and fly sound are stored but take effect in Stages 9 and 12.
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
- Settings are copied into the `GameSet` at set start; changing the menu affects only the next set.
- Economy, shield and guidance numbers are first-pass (income $500 + $10/point, shield 5 units/damage, level flight at 3 px/tick). Stage 13 tunes them.
- Screens that open on a key press (results, shop) ignore input for a short grace period, so a held or double-pressed key doesn't skip or buy.
- The angle is clamped to 0–180; the original wrapped around instead. I clamped deliberately because it's less confusing.
- The Vitest config lives in `vite.config.ts` (imported from `vitest/config`). Unit tests are in `tests/`, e2e tests in `e2e/`.
- `.claude/launch.json` defines the `dev` preview server (port 5173). Playwright uses `vite preview` on 4173.

## Playtest script for current stage

1. Play a normal set (menu → setup with two humans or human vs CPU, 5 games). After each game the status screen shows money. Humans with $3,000+ get the shop: add bundles with + or clicks, watch Unallocated drop, then Purchase or Done. Your purchases show up in the next game's strip.
2. Quick shop test: http://localhost:5173/?play&games=3&money=50000. End the game (K, Y, fire), continue, and shop.
3. Guidance and shields: http://localhost:5173/?play&arsenal&players=3&wind=none.
   - Press H, pick a target with ←→, Enter. Fire high and long: the shell drops straight down onto the target's column.
   - Press V, pick a target on a hill, and lob a shell that comes down at the target's height: it levels off and flies straight at it.
   - Everyone has an Energy Shield (cyan bubble). Shots get soaked ("shield N") until it's spent, then hurt. Falls are soaked by the Inertia Dampener.

## Known issues

- The plateaus style can still leave an occasional 3–4 px wide spike (tank pads are flattened, so tanks are unaffected).
- While the desktop app's browser pane is hidden, rAF stops entirely. That's a pane artifact, not a game bug. Use headless Playwright for visual checks (see WORKING_NOTES).
- Column collapse can leave sheer vertical walls at the edges of a collapsed area. That's inherent to the column model and fits the original's look.
- The dev FPS overlay covers the top-left of the HUD in dev builds (toggle with F3).
- All computer personalities play randomly until Stage 8, so an all-computer game can take a while (use K to mass kill).
- Computers don't buy anything yet (Stage 8), even with "Computers can buy" on.
- The Background and Background speed menu options are stored but not rendered until Stage 12; sound options wait for Stage 9.
- A CRI 20/D on a full field burns about 30k pixels in roughly 2.3 s. It's fine on desktop; check phones in Stage 10/13.
- Tanks buried by dirt can still fire, but their shells hit the dirt right away and hurt them, which is deliberate ("death by dirt").
- A fast drag in the lab carves at sampled pointer positions only (gaps possible). It's a debug tool, so this is fine.
