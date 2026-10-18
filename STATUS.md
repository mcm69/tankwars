# Status

**Current stage:** Stage 9 — Audio (complete, awaiting review)
**Next:** Stage 10 — Touch & responsive layout
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
- [x] 9 — Audio (awaiting review)
- [ ] 10 — Touch & responsive layout
- [ ] 11 — Persistence
- [ ] 12 — Visual polish & backgrounds
- [ ] 13 — Balance, QA & release prep

## Current stage progress

Stage 9 is done: every game event has a synthesized sound, with no audio files.

- **Synth** (`src/audio/synth.ts`): WebAudio enveloped oscillators (square, sine, sawtooth, triangle) with pitch slides, looped white noise through a sweeping biquad filter, sustained voices for the fly sound, and a master gain. It unlocks on the first pointer or key press (browser autoplay rules) and is a silent no-op without WebAudio (tests).
- **Effects** (`src/audio/sfx.ts`): recipes for fire, explosions (noise boom plus a sub thump that grows with radius), puff, laser zap, CRI Geiger crackle, sonic whine, dirt thud, crumble rumble (a new `crumble` sim event), dud clank, hit blip, shield chime, three death jingles (standard, fade, meltdown alarm), round-over fanfare (or a sad descent), turn chime (human turns only), and UI sounds (move, change, select, back, purchase "ka-ching", error buzz). The `roundEvent` switch is **exhaustive**, so a new sim event without a sound won't compile. Same-kind bursts are throttled (45–120 ms) so debris showers don't roar.
- **Fly sound**: a triangle whistle that rises and falls with the shell's height. Off by default; Fly sound in the menu.
- **Settings**: new **Volume** row (0–10, default 7) in the main menu. Sound effects on/off, Fly sound and the in-game **S** / SND button all take effect immediately, because `Sfx` reads settings on every call.
- Sounds are wired into the battle, title (attract shots), menu, setup, shop and results.
- Tests: 175 unit tests (new: every event type sounds, laser not doubled, bigger booms are longer and louder, silence when off or at volume 0, volume applied, throttling, UI sounds, fly voice start/follow/stop/mute) + 14 e2e tests (new: the AudioContext runs after a gesture, shots play, S mutes). **Not verified by ear:** how it actually sounds needs your playtest.

## Implementation notes

- **TypeScript pinned to ~6.0**: TS 7 (the native port) is out, but typescript-eslint 8.71 supports only `<6.1`. Revisit when typescript-eslint supports 7.
- `noUncheckedIndexedAccess` is deliberately off: it makes typed-array pixel code noisy.
- No `const enum` (it doesn't mix with `isolatedModules` and esbuild). Use the `as const` object + type pattern, as `Material` does.
- The RNG test pins the first 3 outputs for seed 1991. If the algorithm changes, saves and replays break, so bump the save version.
- Terrain colors are not stored. They come from position (depth band + hash) at render time, so dirt added by weapons automatically matches.
- The theme choice uses its own RNG stream (`seed ^ 0x5eed`) so presentation never consumes sim randomness. In Stage 6 the theme becomes part of round setup.
- `window.__tankwars` is a debug handle (`ticks`, `scene`, `phase`, `round`, `overlay`, `app`) used by e2e tests and the console. `/` opens the title; `?play` jumps into a set (see above); `?lab` opens the terrain lab.
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

1. `npm run dev`. Sound starts after your first key or click (browser rule). The title's attract shots are audible once you come back to it.
2. Menu: moving and changing options blip. Set Volume (try 3 and 10) and turn Fly sound on.
3. http://localhost:5173/?play&arsenal&players=3: fire each weapon and listen (incinerator vs nukes, laser zap, CRI crackle, sonic whine, dirt thud, crumble rumble). Get hit with and without a shield (chime vs blip) and kill tanks (death jingles, the meltdown alarm), then end the round (fanfare).
4. Press **S** (or click SND) mid-game: silence, and S again brings it back. With Fly sound on, the shell whistles higher as it climbs.
5. In the shop, adding items blips, being too poor buzzes, and Purchase goes "ka-ching".

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
