# Status

**Current stage:** Stage 12 — Visual polish & backgrounds (complete, awaiting review)
**Next:** Stage 13 — Balance, QA & release prep
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
- [x] 12 — Visual polish & backgrounds (awaiting review)
- [ ] 13 — Balance, QA & release prep

## Current stage progress

Stage 12 is done: the skies move and explosions have more punch.

- **Backgrounds** (`src/render/backgrounds.ts`): None (black), Starry Sky (twinkling stars and the odd shooting star), Color Bars (rising bands in eight hues), Circles (rainbow rings spreading from the center), Spreading (a turning three-armed spiral), Blue Sky (the landscape's sky with drifting pixel clouds) and Random (one of the animated five per game, picked from the game's seed). Bars, Circles and Spreading emulate VGA palette cycling: a half-resolution index buffer goes through a rotating 64-color lookup table, so a frame costs one pass over 50k bytes, and only when the colors shift. The palettes stay dark so shells and tanks stand out.
- **Background speed** 0–10 (0 = still) now works.
- **Reduce motion** (Auto/On/Off; Auto follows `prefers-reduced-motion`): stills the background, turns off screen shake and dims the nuke's full-field flash to 20%.
- **Screen shake** (On/Off): scales with blast radius (max 6 px), plus kicks for tank deaths and hard landings. Only the field shakes (never upward), and the HUD and sky stay put.
- **Particles** (`src/render/particles.ts`, presentation only, capped at 700): sparks from every explosion, smoke that rises behind the fireball once it fades (blasts of radius 14+), and dust when a tank lands after a fall. There's also a white flash on each explosion's first frames.
- **Smoother turret**: the drawn barrel eases toward big angle jumps (mouse aim, computer turns) and snaps for small steps, so keyboard aiming stays exact.
- Performance: every background holds 60 fps with 10 computer tanks at 3× speed under 4× CPU throttling in phone emulation.
- Dev params: `?bg=stars&bgspeed=N`. The debug handle has `visuals` (sky, effective speed, motion flags).
- Tests: 191 unit tests (new: reduced-motion logic, settings sanitizing, Random background resolution, shake decay and direction, particle lifetime and cap) + 24 e2e tests (new: every background renders, and reduced motion stills the sky and disables shake, with a settings override).

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

1. Try each Background in the menu (or `?play&bg=circles`). Color Bars rise, Circles spread outward, Spreading turns, Starry Sky twinkles (wait for a shooting star), and Blue Sky has drifting clouds. Random changes from game to game.
2. Background speed 0 freezes the sky; 10 is fast.
3. Fire a nuke or a big missile: white flash, sparks, smoke rising after the fireball, and the field shakes. Blow the ground out from under a tank: dust when it lands.
4. Turn Screen shake off: no shaking. Set Reduce motion to On (or turn on your OS's reduced-motion setting with Auto): the sky stops, there's no shaking, and the nuke flash is dim.
5. Swing the turret with a mouse click far from the current angle: the barrel sweeps instead of jumping. Arrow-key aiming still moves exactly one degree.

## Known issues

- The plateaus style can still leave an occasional 3–4 px wide spike (tank pads are flattened, so tanks are unaffected).
- While the desktop app's browser pane is hidden, rAF stops entirely. That's a pane artifact, not a game bug. Use headless Playwright for visual checks (see WORKING_NOTES).
- Column collapse can leave sheer vertical walls at the edges of a collapsed area. That's inherent to the column model and fits the original's look.
- With 19 menu rows (20 with Resume), the menu's rows are 17 px tall; Restore defaults and Start sit close together.
- Screen shake can show a sliver of sky (up to 3 px) at the field's left and right edges for a frame or two.
- The dev FPS overlay covers the top-left of the HUD in dev builds (toggle with F3).
- On phones the core HUD's small buttons and strip are still tappable but small; the side panels are the intended touch controls. Strip slot taps arm weapons, though the weapon carousel is easier.
- Resuming mid-game restarts that game from its start (by design: saves happen at round boundaries, and the replay is deterministic).
- I haven't tried a real iOS/Android device; it's verified with Chromium mobile emulation only (WebKit isn't installed for Playwright).
- AI quirks are deliberate: Lobber and Lob & Shoot flounder with bouncing walls; Windless Wit repeats wind-blind misses; Rifleman is harmless unless you're above him.
- A CRI 20/D on a full field burns about 30k pixels in roughly 2.3 s. It's fine on desktop; check phones in Stage 10/13.
- Tanks buried by dirt can still fire, but their shells hit the dirt right away and hurt them, which is deliberate ("death by dirt").
- A fast drag in the lab carves at sampled pointer positions only (gaps possible). It's a debug tool, so this is fine.
