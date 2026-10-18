# Status

**Current stage:** Stage 6 — Game flow (complete, awaiting review)
**Next:** Stage 7 — Economy, shop, guidance & shields
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
- [x] 6 — Game flow: title, menu, player setup, sets (awaiting review)
- [ ] 7 — Economy, shop, guidance & shields
- [ ] 8 — Computer opponents
- [ ] 9 — Audio
- [ ] 10 — Touch & responsive layout
- [ ] 11 — Persistence
- [ ] 12 — Visual polish & backgrounds
- [ ] 13 — Balance, QA & release prep

## Current stage progress

Stage 6 is done: the full loop runs from title to final results, played entirely through the UI.

- **App and scenes** (`src/app.ts`, `src/scenes/*`): a scene router for title → menu → setup → battle ⇄ status → final → menu. Each scene disposes its listeners (input controllers use `AbortController`).
- **Title** (`title.ts`): a two-tone 8× pixel logo over a sunset battlefield, with a big tank lobbing shells that crater the hills (attract animation). Any key or click continues.
- **Main menu** (`menu.ts`): every option from the original (sound, fly sound, crumble, walls, wind, visible shot, shot trace, background, background speed, games per set 1–99, tanks fall, players 2–10, explosions kill, computers can buy) and Start. It works like the original: ↑↓ move the `*` cursor, ←→ change; you can also click ◀ ▶ or the value (right-click goes back), or use the wheel. Each row has a help line.
- **Player setup** (`setup.ts`): per slot a color tank, an editable name, Human/CPU, and a personality picker (Random, Mr. Stupid, Lobber, Rifleman, Windless Wit, Lob & Shoot, Twanger) with the manual's threat blurb. Default names follow the type/AI. Keyboard (Enter name, H/C, ←→, S, Esc) and mouse both work.
- **Sets** (`src/game/set.ts`): `GameSet` holds players, carried-over inventories (starting kit scaled by games per set), scores, wins and kills, and gives each round its own seed (new terrain, wind and theme each game). Round **stats** credit damage and kills to whoever's turn it is; mass kills credit nobody.
- **Scoring (provisional)**: damage dealt − self-damage + 150 per kill + 300 for surviving the round. Stage 7 settles scoring and money.
- **Status and final screens** (`results.ts`): standings with score (and per-game gain), wins and kills; the winner of the game or set. All-computer sets advance by themselves.
- **Computer players** (`src/ai/registry.ts`): the AI registry, names and blurbs, plus a **stub** that plays every personality like Mr. Stupid (random aim and power) after a short think delay (faster when no humans play). Stage 8 replaces the stub with the real strategies. Humans can't send commands during a computer's turn; UI keys still work.
- Quit (Q) now aborts the set back to the menu ("Game aborted"). The F2 dev options panel was removed (the menu replaces it).
- `?play` skips straight into a set for dev and tests: `players=`, `cpu=` (last N are computers), `games=`, `seed=`, `arsenal`, and the option params.
- Tests: 124 unit tests (new: GameSet slots/colors/random AI/inventory/rounds/carry-over/scoring/standings, round stat attribution) + 11 e2e tests (new: a full 2-game human-vs-computer set via the UI only, quit to menu, setup mouse controls). I checked the title, menu, setup and status screens with headless screenshots.

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
- The angle is clamped to 0–180; the original wrapped around instead. I clamped deliberately because it's less confusing.
- The Vitest config lives in `vite.config.ts` (imported from `vitest/config`). Unit tests are in `tests/`, e2e tests in `e2e/`.
- `.claude/launch.json` defines the `dev` preview server (port 5173). Playwright uses `vite preview` on 4173.

## Playtest script for current stage

1. `npm run dev`, then open http://localhost:5173. On the title, watch the tank shell the hills, then press any key.
2. In the main menu, change options with ↑↓/←→ or the mouse (try games per set 3, players 3), then choose Start (or press S).
3. In setup, rename players (Enter or click the name), switch Human/CPU (click or H/C), pick personalities (←→ or click). The blurb explains each. Press Start.
4. Play: computers take their turns after a short pause (all still random for now). After each game there's a status screen with scores, wins and kills; after the last one, Final Results; then back to the menu.
5. Q then Y mid-game returns to the menu ("Game aborted"). For a quick all-computer show, try http://localhost:5173/?play&players=4&cpu=4&games=3.

## Known issues

- The plateaus style can still leave an occasional 3–4 px wide spike (tank pads are flattened, so tanks are unaffected).
- While the desktop app's browser pane is hidden, rAF stops entirely. That's a pane artifact, not a game bug. Use headless Playwright for visual checks (see WORKING_NOTES).
- Column collapse can leave sheer vertical walls at the edges of a collapsed area. That's inherent to the column model and fits the original's look.
- The dev FPS overlay covers the top-left of the HUD in dev builds (toggle with F3).
- H/V guidance and shields show in the HUD but do nothing until Stage 7.
- All computer personalities play randomly until Stage 8, so an all-computer game can take a while (use K to mass kill).
- Scoring is provisional, and there's no money or shop yet (Stage 7).
- The Background and Background speed menu options are stored but not rendered until Stage 12; sound options wait for Stage 9.
- A CRI 20/D on a full field burns about 30k pixels in roughly 2.3 s. It's fine on desktop; check phones in Stage 10/13.
- Tanks buried by dirt can still fire, but their shells hit the dirt right away and hurt them, which is deliberate ("death by dirt").
- A fast drag in the lab carves at sampled pointer positions only (gaps possible). It's a debug tool, so this is fine.
