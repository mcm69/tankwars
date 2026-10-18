# Status

**Current stage:** Stage 8 — Computer opponents (complete, awaiting review)
**Next:** Stage 9 — Audio
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
- [x] 7 — Economy, shop, guidance & shields
- [x] 8 — Computer opponents (awaiting review)
- [ ] 9 — Audio
- [ ] 10 — Touch & responsive layout
- [ ] 11 — Persistence
- [ ] 12 — Visual polish & backgrounds
- [ ] 13 — Balance, QA & release prep

## Current stage progress

Stage 8 is done: the six original computer opponents (plus one new one) play as the manual describes, buy equipment, and can be pitted against each other headlessly.

- **Thinking by probing** (`src/ai/probe.ts`): `probeShot` simulates a shot with the real physics on the current terrain without changing anything, optionally assuming a different wind or walls. AIs search over probes (bisection on power per elevation), so "exact physics" really is exact. `Round.shotLog` records every shot and its impact, which Lobber learns from.
- **Personalities** (`src/ai/strategies.ts`):
  - **Mr. Stupid**: random weapon, angle (any direction) and power.
  - **Lobber**: two ranging shots at 75° with his cheapest weapon, then targets whoever is nearest his last impact and scales power by √(wanted range / last range). Rebound and strong wind confuse him.
  - **Rifleman**: points straight at the nearest enemy above him at full power (and fast shells dud more), otherwise random. He uses a laser on any enemy in reach when he has the energy.
  - **Windless Wit**: probe-perfect aim that assumes no wind.
  - **Lob & Shoot**: Lobber without bouncing walls, Rifleman with them.
  - **Twanger**: Rifleman without walls. With walls he grid-searches steep shots that bank off the ceiling onto the easiest kill (weakest, then nearest), and banks in 19/20 test setups.
  - **Birdy Bonker** (new, the hidden name found in BOMB.EXE): probes with the real wind and walls, picks off the weakest, with a hair of error. Selectable, but not in "Random" (which picks from the original six).
- **Weapon choice**: the strongest owned blast that won't catch the shooter (radius + 18 < distance). Lasers are priced by walking the beam line (air/dirt costs).
- **Buying** (`src/ai/buy.ts`, `GameSet.computersShop`): when "Computers can buy" is on, each computer works through a per-personality priority list (shields and lasers for the smart ones, bigger bombs for the lobbers, random junk for Mr. Stupid), at most two bundles each, keeping ~15% back.
- **In the game** (`battle.ts`): after a think pause the turret visibly swings and the power winds to the plan before firing. All-computer games run at 3× speed with instant aiming, and call a **stalemate mass kill** after 30 shots per player (the original left that to a human's Ctrl-M).
- **Tournament harness**: `npm run sim -- [--ais a,b] [--games N] [--seed S] [--wind ...] [--walls ...] [--mode duel|ffa|both]` (via `tsx`; logic in `src/ai/tournament.ts`). It prints duel and free-for-all win rates plus a head-to-head matrix. A full run takes about 3 s.
- `?play&cpu=N&ai=<id>` chooses the computers' personality (default random).
- Tests: 152 unit tests (new: probe accuracy and purity; Windless hits in calm air and ignores wind; Rifleman's direct aim; Lobber ranges at 75° then homes in; Twanger banks; Lob & Shoot switches; every AI makes legal plans; weapon safety; laser pricing; shopping never overspends and has priorities; tournament runs and ranks Windless over Stupid) + 13 e2e tests; all pass. I watched mixed and all-computer sets play to Final Results headlessly.

**Tournament (20 games per pairing, standard wind, random walls, seed 1), duel win rates:** Birdy Bonker 95%, Windless Wit 48%, Lob & Shoot 48%, Lobber 46%, Twanger 40%, Rifleman 22%, Mr. Stupid 10%. With walls off: Lob & Shoot 62%, Lobber 54%, Windless 43%, Twanger/Rifleman 18%. With walls on: Twanger 55% (best of the originals), Windless 50%, Lobber 29%, Rifleman 27%, Lob & Shoot 24%. Windless Wit: 100% with no wind, 50% in high wind. This matches the manual's threat descriptions.

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
- AIs use their own RNG stream per round (`roundSeed ^ 0xa1`) and per-round memory, so they never perturb the round's RNG. The headless and in-game paths share `planTurn`.
- Screens that open on a key press (results, shop) ignore input for a short grace period, so a held or double-pressed key doesn't skip or buy.
- The angle is clamped to 0–180; the original wrapped around instead. I clamped deliberately because it's less confusing.
- The Vitest config lives in `vite.config.ts` (imported from `vitest/config`). Unit tests are in `tests/`, e2e tests in `e2e/`.
- `.claude/launch.json` defines the `dev` preview server (port 5173). Playwright uses `vite preview` on 4173.

## Playtest script for current stage

1. Menu → setup → make player 2 a computer and pick a personality (←→), then start. Watch it think, swing the turret and fire. Try **Windless Wit** with Wind None (deadly) and with Wind Gale (harmless), **Twanger** with walls Yes (bank shots), and **Lobber** (ranging shots, then closing in).
2. Shows: http://localhost:5173/?play&players=4&cpu=4&games=3 (random personalities; plays itself at 3×, and stalemates end in a mass kill), or force one with `&ai=twanger&walls=on`.
3. Computers buy between games (see their strips next game; turn "Computers can buy" off in the menu to stop it).
4. `npm run sim -- --games 20` prints the tournament tables. Try `--walls on`, `--wind none`, or `--ais lobber,twanger --mode duel`.

## Known issues

- The plateaus style can still leave an occasional 3–4 px wide spike (tank pads are flattened, so tanks are unaffected).
- While the desktop app's browser pane is hidden, rAF stops entirely. That's a pane artifact, not a game bug. Use headless Playwright for visual checks (see WORKING_NOTES).
- Column collapse can leave sheer vertical walls at the edges of a collapsed area. That's inherent to the column model and fits the original's look.
- The dev FPS overlay covers the top-left of the HUD in dev builds (toggle with F3).
- AI quirks are deliberate: Lobber and Lob & Shoot flounder with bouncing walls; Windless Wit repeats wind-blind misses; Rifleman is harmless unless you're above him.
- The Background and Background speed menu options are stored but not rendered until Stage 12; sound options wait for Stage 9.
- A CRI 20/D on a full field burns about 30k pixels in roughly 2.3 s. It's fine on desktop; check phones in Stage 10/13.
- Tanks buried by dirt can still fire, but their shells hit the dirt right away and hurt them, which is deliberate ("death by dirt").
- A fast drag in the lab carves at sampled pointer positions only (gaps possible). It's a debug tool, so this is fine.
