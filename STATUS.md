# Status

**Current stage:** Stage 13 — Balance, QA & release prep (complete, awaiting sign-off)
**Next:** Sign-off, first GitHub Pages deploy, balance tweaks from playtesting
**Last updated:** 2026-10-19

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
- [x] 10 — Touch & responsive layout
- [x] 11 — Persistence
- [x] 12 — Visual polish & backgrounds
- [x] 13 — Balance, QA & release prep (awaiting sign-off)

## Current stage progress

Stage 13 is done, apart from sign-off and the choices below. Version 1.0.0.

- **Performance:** 10 tanks with a 5 Mt nuke, CRI 20/D and CRI 20/ND (crumble 100%, the fastest animated sky) hold 60 fps at 6× CPU throttling in phone emulation. A minute of 10-computer play shows no heap growth, so no fixes were needed.
- **Error boundary:** any uncaught error stops the loop (`GameLoop` now honors `stop()` mid-frame) and shows a DOM crash panel with the message, **Copy debug info** (falling back to a selectable text box) and Reload. Your settings and the set as of the start of the game are saved, so Resume works.
- **Debug state and replays:** `Round` keeps a copy of its config and a log of every accepted command (`commandLog`). The debug state (`src/debug/debug-state.ts`: version, settings, set snapshot, round config, log, tick) is copied with **F9** in battle or from the crash panel, and `window.__tankwars.debugState()` returns it. `npm run replay -- report.json [--until TICK]` replays it headlessly (`src/sim/replay.ts`) and rethrows any crash.
- **Accessibility:** a **Tank names** option (Options → Display) labels each tank with its player's name, so nobody has to rely on color. Together with Reduce motion this covers the plan. Remappable keys stay a stretch goal.
- **Balance:** the AI tournament ranking still matches the manual (Birdy Bonker 94% in duels, then Windless Wit, Lob & Shoot and Lobber around 47%, Twanger 40%, Rifleman 22%, Mr. Stupid 10%). I couldn't do the side-by-side DOSBox sessions, so the physics, weapon and economy numbers are the first-pass values listed below, to tune from your playtesting.
- **Release:** a static build (47.6 kB gzipped JS) with relative paths, checked from a subpath on a plain file server. There's a web manifest and our own pixel-tank icon (SVG plus 180/192/512 PNGs), and a hand-written service worker (`public/sw.js`, production only) that makes it playable offline after the first visit, verified by an offline reload. The version shows on the title screen. A README covers playing, development, bug reports and deploying.
- **Hosting:** GitHub Pages via `.github/workflows/deploy.yml` (lint, unit tests, build, then deploy `dist/` on each push to `main`). The steps were checked in a clean clone. It hasn't run on GitHub yet: the repository has no remote.
- Tests: 202 unit tests (new: replay reproduces whole AI rounds exactly, stops at a tick, detects divergence) + 28 e2e tests (new: a real in-browser game replays to the identical state in Node; F9 copies the debug state; a crash stops the game and shows the panel).

## Implementation notes

- **TypeScript pinned to ~6.0**: TS 7 (the native port) is out, but typescript-eslint 8.71 supports only `<6.1`. Revisit when typescript-eslint supports 7.
- `noUncheckedIndexedAccess` is deliberately off: it makes typed-array pixel code noisy.
- No `const enum` (it doesn't mix with `isolatedModules` and esbuild). Use the `as const` object + type pattern, as `Material` does.
- The RNG test pins the first 3 outputs for seed 1991. If the algorithm changes, saves and replays break, so bump the save version.
- Terrain colors are not stored. They come from position (depth band + hash) at render time, so dirt added by weapons automatically matches.
- The theme choice uses its own RNG stream (`seed ^ 0x5eed`) so presentation never consumes sim randomness. In Stage 6 the theme becomes part of round setup.
- `window.__tankwars` is a debug handle (`ticks`, `scene`, `phase`, `round`, `overlay`, `app`, `touchLayout`) used by e2e tests and the console. `/` opens the title; `?play` jumps into a set (see above); `?lab` opens the terrain lab.
- **Menus are canvas-rendered** (PLAN §2.1 item 6 revised): the widget kit is in `src/ui/widgets.ts`, and `TextEntry` (an off-screen input) handles names. Keys typed before the field takes focus (same tick) are fed in by the scene.
- Settings (`src/game/settings.ts`) = sim `GameOptions` + sound, volume, fly sound, background, background speed, reduce motion, screen shake, games per set, players, computers buy. They're saved to localStorage (Stage 11). Presentation settings (sound, background, motion) are read live from `app.settings`; sim options are copied into the set.
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

1. Play a full set or two (humans and computers). Note anything that feels off against the original: blast sizes, wind strength, damage, prices, income, AI strength.
2. Turn on Options → Display → Tank names: names float over the tanks.
3. In battle, press F9: "Debug info copied". Paste it somewhere to see the JSON.
4. `npm run build && npx vite preview`, open it, then go offline (DevTools → Network → Offline) and reload: it still loads. On a phone, try "Add to Home Screen".
5. Optional crash test: in the console, `__tankwars.app.currentScene.update = () => { throw new Error('test') }`. The crash panel appears, and Reload offers Resume.

## Known issues

- The plateaus style can still leave an occasional 3–4 px wide spike (tank pads are flattened, so tanks are unaffected).
- While the desktop app's browser pane is hidden, rAF stops entirely. That's a pane artifact, not a game bug. Use headless Playwright for visual checks (see WORKING_NOTES).
- Column collapse can leave sheer vertical walls at the edges of a collapsed area. That's inherent to the column model and fits the original's look.
- Screen shake can show a sliver of sky (up to 3 px) at the field's left and right edges for a frame or two.
- The dev FPS overlay covers the top-left of the HUD in dev builds (toggle with F3).
- On phones the core HUD's small buttons and strip are still tappable but small; the side panels are the intended touch controls. Strip slot taps arm weapons, though the weapon carousel is easier.
- Resuming mid-game restarts that game from its start (by design: saves happen at round boundaries, and the replay is deterministic).
- I haven't tried a real iOS/Android device; it's verified with Chromium mobile emulation only (WebKit isn't installed for Playwright).
- AI quirks are deliberate: Lobber and Lob & Shoot flounder with bouncing walls; Windless Wit repeats wind-blind misses; Rifleman is harmless unless you're above him.
- A CRI 20/D on a full field burns about 30k pixels in roughly 2.3 s. It's fine on desktop; check phones in Stage 10/13.
- Tanks buried by dirt can still fire, but their shells hit the dirt right away and hurt them, which is deliberate ("death by dirt").
- A fast drag in the lab carves at sampled pointer positions only (gaps possible). It's a debug tool, so this is fine.
