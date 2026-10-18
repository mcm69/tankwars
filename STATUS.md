# Status

**Current stage:** Stage 10 — Touch & responsive layout (complete, awaiting review)
**Next:** Stage 11 — Persistence
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
- [x] 8 — Computer opponents
- [x] 9 — Audio
- [x] 10 — Touch & responsive layout (awaiting review)
- [ ] 11 — Persistence
- [ ] 12 — Visual polish & backgrounds
- [ ] 13 — Balance, QA & release prep

## Current stage progress

Stage 10 is done: the game is fully playable on phones and tablets in landscape.

- **Touch layout** (`src/render/screen.ts`): on coarse-pointer devices (or `?touch=1`), the canvas widens to the device's aspect (800–960 logical px) and fills the screen with fractional scaling, with the 640×400 game "core" centered and **side panels** for big buttons. Narrower screens (iPhone SE, 4:3 tablets) letterbox vertically so the panels stay at least 80 px wide. Desktop is unchanged (640 wide, crisp integer scaling). Scenes still draw and hit-test in core coordinates; `Screen.toCanvas` and `toLogical` convert, and scenes can draw into the panels via `renderSides`.
- **Side controls** (`src/input/touch-controls.ts`, `src/render/touch-panel.ts`): left panel has angle ◀ ▶ and power − + (hold to repeat and accelerate, multi-touch so both can be held), flip, and pause; right panel has a weapon carousel (icon, name, count), H/V guidance (lit when armed), and a big FIRE bar in the player's color, all showing live values. Drag-to-aim on the field and tap-a-tank status already worked through Pointer Events.
- **Touch-friendly screens**: the Game Status (pause) panel now has **Resume / Controls / Mass kill / Quit** buttons (desktop benefits too); help shows touch controls on touch devices; menu rows are taller; shop −/+ have full-row-height tap targets; menu, setup and shop hints adapt to touch.
- **Name entry on phones**: name fields open synchronously inside the tap (iOS only shows the keyboard then). The canvas no longer takes focus on mousedown, so a tap's emulated mouse events don't close the keyboard, and tapping elsewhere commits. The hidden input is 16 px so iOS doesn't zoom.
- **Portrait**: a "turn your device sideways" prompt (CSS media query), and the game pauses until you rotate. Pinch, double-tap zoom, text selection, callouts and tap highlights are suppressed.
- Robustness: pointer capture is best-effort everywhere (a failed capture used to drop the press).
- Tests: 178 unit tests (new: touch canvas width, fill scaling, side-panel layout fits with no overlaps) + 20 e2e tests (new mobile suite under iPhone 13 landscape emulation: layout, side buttons, hold-repeat, pause → Quit by touch, tapping a name focuses the field and typing works, portrait prompt pauses and resumes). I checked iPhone 13, iPhone SE and iPad screenshots.

## Implementation notes

- **TypeScript pinned to ~6.0**: TS 7 (the native port) is out, but typescript-eslint 8.71 supports only `<6.1`. Revisit when typescript-eslint supports 7.
- `noUncheckedIndexedAccess` is deliberately off: it makes typed-array pixel code noisy.
- No `const enum` (it doesn't mix with `isolatedModules` and esbuild). Use the `as const` object + type pattern, as `Material` does.
- The RNG test pins the first 3 outputs for seed 1991. If the algorithm changes, saves and replays break, so bump the save version.
- Terrain colors are not stored. They come from position (depth band + hash) at render time, so dirt added by weapons automatically matches.
- The theme choice uses its own RNG stream (`seed ^ 0x5eed`) so presentation never consumes sim randomness. In Stage 6 the theme becomes part of round setup.
- `window.__tankwars` is a debug handle (`ticks`, `scene`, `phase`, `round`, `overlay`, `app`, `touchLayout`) used by e2e tests and the console. `/` opens the title; `?play` jumps into a set (see above); `?lab` opens the terrain lab.
- **Menus are canvas-rendered** (PLAN §2.1 item 6 revised): the widget kit is in `src/ui/widgets.ts`, and `TextEntry` (an off-screen input) handles names. Keys typed before the field takes focus (same tick) are fed in by the scene.
- Settings (`src/game/settings.ts`) = sim `GameOptions` + sound, volume, fly sound, background, background speed, games per set, players, computers buy. They live in memory for now (persistence is Stage 11). Background and background speed are stored but take effect in Stage 12.
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

1. On a phone or tablet on the same network, run `npm run dev -- --host` and open the shown URL (or use desktop Chrome DevTools device mode, or `?touch=1` to force the touch layout).
2. Portrait shows the rotate prompt; landscape shows the game with side panels.
3. Title → tap. Menu: tap ◀ ▶ or values. Setup: tap a name (the keyboard appears), type, tap elsewhere; tap Human/CPU and the personality.
4. In battle: drag on the field to aim, or hold the ◀ ▶ / − + buttons. Use the weapon arrows, H/V, and FIRE. Tap a tank for its status. ‖ opens Game Status with Resume / Controls / Mass kill / Quit.
5. Shop between games: tap rows or + to add, − to remove, Done.
6. Desktop should look and play exactly as before.

## Known issues

- The plateaus style can still leave an occasional 3–4 px wide spike (tank pads are flattened, so tanks are unaffected).
- While the desktop app's browser pane is hidden, rAF stops entirely. That's a pane artifact, not a game bug. Use headless Playwright for visual checks (see WORKING_NOTES).
- Column collapse can leave sheer vertical walls at the edges of a collapsed area. That's inherent to the column model and fits the original's look.
- The dev FPS overlay covers the top-left of the HUD in dev builds (toggle with F3).
- On phones the core HUD's small buttons and strip are still tappable but small; the side panels are the intended touch controls. Strip slot taps arm weapons, though the weapon carousel is easier.
- I haven't tried a real iOS/Android device; it's verified with Chromium mobile emulation only (WebKit isn't installed for Playwright).
- AI quirks are deliberate: Lobber and Lob & Shoot flounder with bouncing walls; Windless Wit repeats wind-blind misses; Rifleman is harmless unless you're above him.
- The Background and Background speed menu options are stored but not rendered until Stage 12; sound options wait for Stage 9.
- A CRI 20/D on a full field burns about 30k pixels in roughly 2.3 s. It's fine on desktop; check phones in Stage 10/13.
- Tanks buried by dirt can still fire, but their shells hit the dirt right away and hurt them, which is deliberate ("death by dirt").
- A fast drag in the lab carves at sampled pointer positions only (gaps possible). It's a debug tool, so this is fine.
