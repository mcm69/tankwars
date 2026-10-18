# Status

**Current stage:** Stage 4 — HUD & full controls (complete, awaiting review)
**Next:** Stage 5 — Weapon system & full arsenal
**Last updated:** 2026-10-18

See [PLAN.md](PLAN.md) for the full stage list. Update this file at the end of every work session
and at every stage boundary.

## Stage checklist

- [x] 0 — Project scaffold
- [x] 1 — Terrain & battlefield rendering
- [x] 2 — Tanks, aiming, ballistics (first playable)
- [x] 3 — Environment rules
- [x] 4 — HUD & full controls (desktop, awaiting review)
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

Stage 4 is done: the play screen is feature-complete for keyboard and mouse.

- **Items and inventory** (`src/sim/items.ts`): the full catalog of 18 weapons, H/V guidance and 2 shields, in the original's strip order, with prices and bundles from BOMB.EXE. Tanks carry an `inventory` and an armed `selected` weapon, and start with the 2.5 rules (100 Lead Balls, 10 Grenades, 3 Incinerators). New sim commands: `selectWeapon`, `cycleWeapon`, `setAim`, `setPower`, `massKill`. Firing spends ammo and moves to the next owned weapon when one runs out; with nothing left it fires a Lead Ball. **Every weapon is still a plain blast with temporary radius/damage numbers** (Lead Ball is a harmless puff) until Stage 5.
- **Bitmap font** (`src/render/font.ts`): an original 5×7 LCD-style font (ASCII plus arrows, ◀▶, …, ×, ±) rendered from cached per-color atlases at any integer scale, with drop shadows, plus 3×5 micro digits for counts. All canvas text now uses it; no browser fonts on the canvas.
- **Icons** (`src/render/icons.ts`): procedural 10×10 pixel icons for all 22 items, plus dimmed "not owned" variants.
- **HUD** (`hud.ts`, `hud-layout.ts`): Angle and Power with ◀ ▶ buttons, a direction arrow (click to flip), player name in color, Men, wind and level, the R badge, the armed weapon's name and count, a big FIRE button, and the equipment strip of 20 slots (dim = not owned, outlined = owned, red = armed, with counts), plus the shield indicator and help/pause/sound buttons. The layout is shared with the pointer hit-tester.
- **Keyboard** (`input/keyboard.ts`): adds Tab/Shift+Tab (weapon), H/V (guidance; for now a toast), 1–9/0 (player status), Esc/P (pause), F1/? (help), S (sound), K (mass kill), Q (quit).
- **Mouse** (`input/pointer.ts`, `input/aim.ts`): drag on the field to aim (direction from the turret, distance = power, dotted preview); click ◀ ▶ (hold repeats and accelerates); click "Power" for ±100; click a slot to arm; wheel for power (Shift ×10); click any tank for its status; FIRE button.
- **Overlays** (`render/overlays.ts`): Game Status (pause), Controls (help), player status card (stats plus owned equipment), and Yes/No confirmations for mass kill and quit. Overlays freeze the sim. Toasts show feedback (sound, guidance, game aborted).
- Tests: 89 unit tests (new: catalog/prices/icons, inventory and weapon commands, Lead Ball harmlessness, mass kill, HUD hit-test with no overlaps, aim math, font glyphs, keyboard mapping and repeat) + 8 e2e tests (new: HUD clicks, drag-aim, overlays freeze/close, mass-kill confirm); all pass. I checked the HUD and every overlay with headless screenshots.

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
- Weapons temporarily use `ItemDef.blast` (radius/damage) in `items.ts`; Stage 5 replaces this with per-weapon behaviors. `DEATH_BLAST` (radius 22, damage 80) is in `round.ts`.
- **Key bindings differ from the original's Ctrl combos** (Ctrl-P/S/Q/M collide with the browser's print, save, quit and so on). They are single keys: P/Esc pause, S sound, Q quit, K mass kill, and the original's Alt fine-step is now Shift.
- Input events are processed in order within a tick. An overlay opened mid-tick receives the rest, and once it consumes one event the remainder of that tick is dropped (one Esc press both closes and maps to pause).
- Sound on/off is a UI flag only until Stage 9.
- Deaths only resolve after a shot (during settling), so zeroing health by hand mid-aim does nothing until someone fires.
- **Crumble interpretation:** crumble % is a _per-shot_ chance that all loose ground collapses, not a per-pixel or per-column chance. This matches the manual ("how often loose ground will fall") and gives the Sonic Blaster a clear job. Rolling always consumes RNG, so determinism holds.
- Dirt falling onto a tank passes through it (tanks aren't in the material grid), so a tank can end up buried. Shots still hit it, because tanks are checked before terrain.
- Sim options apply when a round is created, so changes in the F2 panel affect the next round; visible shot and trail apply immediately.
- The angle is clamped to 0–180; the original wrapped around instead. I clamped deliberately because it's less confusing.
- The Vitest config lives in `vite.config.ts` (imported from `vitest/config`). Unit tests are in `tests/`, e2e tests in `e2e/`.
- `.claude/launch.json` defines the `dev` preview server (port 5173). Playwright uses `vite preview` on 4173.

## Playtest script for current stage

1. `npm run dev`, then open http://localhost:5173 (add `?players=4`). Press F3 to hide the FPS overlay.
2. HUD: click ◀ ▶ beside Angle and Power (hold to repeat), click the direction arrow to flip, click "Power" (+100, right-click −100), use the wheel over the field, and click FIRE.
3. Drag on the field from your tank's side: the barrel follows, and distance sets power (dotted preview).
4. The strip shows dim icons for weapons you don't own. Click the grenade or Lead Ball slot, or press Tab/Shift+Tab; the armed slot turns red and the counts drop as you fire. (All weapons still behave as simple blasts.)
5. Press 1–9 or click a tank for its status; Esc/P for Game Status; F1 or ? for Controls. Any key or click closes them, and the game is frozen meanwhile.
6. K then Y: everyone dies after the current shot. Q then Y: the game is aborted and a new round starts. S toggles the sound flag (toast plus the SND button).

## Known issues

- The plateaus style can still leave an occasional 3–4 px wide spike (tank pads are flattened, so tanks are unaffected).
- While the desktop app's browser pane is hidden, rAF stops entirely. That's a pane artifact, not a game bug. Use headless Playwright for visual checks (see WORKING_NOTES).
- Column collapse can leave sheer vertical walls at the edges of a collapsed area. That's inherent to the column model and fits the original's look.
- The dev FPS overlay covers the top-left of the HUD in dev builds (toggle with F3).
- H/V guidance and shields show in the HUD but do nothing until Stage 7.
- The DOM dev panel (F2) still uses a browser font; it gets replaced by the real menu in Stage 6.
- A fast drag in the lab carves at sampled pointer positions only (gaps possible). It's a debug tool, so this is fine.
