# Working Notes

Persistent knowledge across sessions: findings about the original, tuning numbers, gotchas,
conventions. Keep entries short and dated when useful. Remove anything that turns out wrong.

## Project ground rules

- Inspired remake; **no original assets** in the build. `reference/` is research-only.
- Sim (`src/sim`) stays pure and deterministic: seeded RNG, fixed ticks, no DOM/time.
- Stop for user review at each stage boundary; update STATUS.md every session.

## The original (Tank Wars 2.5, May 1991, Kenny Morse)

- Turbo Pascal 6 + Borland BGI VGA256 driver (320×200×256, mode 13h), overlay file `BOMB.OVR`.
  Working title "BOMB", hence the file names.
- `BOMB.EXE` refuses to run without `BOMB.CFG` (created by `BOMBCFG.EXE`).
- Manual: `BOMB.DOC`; option help: `BOMBCFG.HLP` (plain text between binary separators,
  readable with `strings`); changelog: `REVISION.HST`. **The manual is partly older than 2.5**:
  REVISION.HST overrides it (e.g. starting inventory, Laser replacing CRI 4/ND).
- `BOMB1.RAW` / `BOMB2.RAW` (title art): 64000 bytes of 320×200 8-bit pixels followed by a
  768-byte VGA palette (6-bit RGB, 0–63). BOMB2 is the base layer, BOMB1 the "spectacular" variant.
- Screenshots in `reference/screenshots/` come from dosbox-staging (title, shop, in-game with
  "neon circles" and "stars" backgrounds, status screen, BOMBCFG screens).

### Data tables found in BOMB.EXE (file offsets)

Pascal strings in 256-byte records: AI names at 0xEA31 (`Random`, Mr. Stupid, Lobber,
Rifleman, Lob & Shoot, Windless Wit, Twanger); weapon long names at 0xF131; short names at 0x10331;
guidance at 0x1159D; shields at 0x119A9. The string "Birdy Bonker" also appears (unknown, maybe a hidden AI).

Price (longint, -1 = not for sale) at 0x11530, bundle size (word) right after.
Confirmed against the shop screenshot.

| #   | Weapon (short name)                            | Price | Bundle              |
| --- | ---------------------------------------------- | ----- | ------------------- |
| 0   | Lead Ball                                      | —     | —                   |
| 1   | Incinerator                                    | 3000  | 100                 |
| 2   | Mark II Incin.                                 | 4000  | 10                  |
| 3   | 20 Kilo Nuke                                   | 7000  | 2                   |
| 4   | 5 Meg Nuke                                     | 10000 | 1                   |
| 5   | Laser                                          | 10000 | 1000 (energy units) |
| 6   | CRI 4/D                                        | 5000  | 5                   |
| 7   | CRI 8/ND                                       | 5000  | 10                  |
| 8   | CRI 8/D                                        | 10000 | 3                   |
| 9   | CRI 20/ND                                      | 10000 | 3                   |
| 10  | CRI 20/D                                       | 15000 | 1                   |
| 11  | Hand Grenade                                   | —     | —                   |
| 12  | Sonic Blaster                                  | 4500  | 10                  |
| 13  | Ball 'O' Dirt                                  | 4000  | 10                  |
| 14  | Mark II Dirt (Ball o Dirt Mark II)             | 6000  | 7                   |
| 15  | Pressured Dirt (Ball o Compressed Dirt)        | 8000  | 3                   |
| 16  | High Pres. Dirt (Ball o Super-Compressed Dirt) | 10000 | 1                   |
| 17  | Xplosive Dirt                                  | 4500  | 10                  |

Items: Herb's Guidance System (H) 20000 / 5; Vick's Guidance System (V) 20000 / 5;
Energy Absorption Shield 20000 / 1000(?); Inertia Dampener 10000 / 100(?). The shield bundle
values are a less certain read (0x11DA8).

Equipment strip order in game = weapon index 0–17, then H, V (20 boxes).

### Rules gleaned (2.5)

- Start: 100 Lead Balls per set; 10 Hand Grenades and 3 Incinerators per game in the set.
- Power is capped by "Men" (manual says 100×Men; the screenshot shows Men: 99, so verify).
- Wind levels: None/Low/Standard/High/Gale/Random (Standard = typical 0–100, gusts ~800; Gale >10000).
- Walls: off (shot aborts when it can't return, e.g. off-screen downwind), on (reflect), random per round with a magenta "R".
- The angle wraps past 0 to the other side (180° range); `I` flips direction.
- Turn order is left to right; tank placement order is random each round; first player random.
- Backgrounds: None, Starry Sky, Color Bars, Circles o' Color, Spreading Colors, Blue, Random.
- Death styles: standard explosion, death by dirt, fading away, nuclear meltdown.

## Tooling

- Node v26 (`/opt/homebrew/bin/node`), npm; python3; `dosbox-staging` at `/opt/homebrew/bin/dosbox-staging`.
- No disassembler installed (not needed: the agreed approach is no disassembly).

## Remake decisions

- Layout (Stage 1): 640×400 logical canvas, HUD band 0–64, field 624×320 at (8,72). The original's
  field was about 300×146 of 320×200, so ours is about 2× and a bit taller for 16:9 screens.
- Key bindings: the original's Ctrl-P/S/M/Q became P (or Esc), S, K (mass kill), Q (browser-safe); Alt fine-step became Shift.
- Canvas text uses only the bitmap font in `src/render/font.ts` (crisp at logical pixels). Add glyphs there if new symbols are needed; tests check that every glyph is well-formed.
- Weapon interpretations (Stage 5): the laser spends energy equal to power (minimum 100) as a straight beam that tunnels and pierces; CRI number = pixel budget, D = 8-neighbor dense spread and ND = 4-neighbor ragged spread; Explosive Dirt clods _freeze mid-air_ when their lifetime ends ("may just stay there"); duds bore through tanks for 25 damage.
- Death styles (from REVISION.HST 1.2: dirt, fading away, nuclear meltdown, plus the standard explosion) with weights 55/15/15/15.
- Crumble % = per-shot chance that _all_ loose ground collapses (column sand model), not per pixel.
- Fall damage: (distance − 4 px) × 0.5. Initial drop-in is free.
- Terrain surface band is 18–90% of field height from the top. Tanks will need headroom above the highest ground.

## Gotchas

- **Browser pane hidden ⇒ rAF paused.** For visual verification, run a throwaway Playwright script
  (`import { chromium } from '@playwright/test'`) against the dev server and screenshot into the
  scratchpad. Scripts must run from the repo dir so `@playwright/test` resolves (copy in, run, delete).
- Any element with a CSS `display` value ignores the `hidden` attribute unless there's a
  `[hidden] { display: none !important }` rule (now in `style.css`).
- Input commands apply on the next sim tick, so tests must poll after sending keys.
