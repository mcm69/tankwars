# Tank Wars — Browser Remake: Implementation Plan

An **inspired remake** of Kenny Morse's _Tank Wars_ 2.5 (DOS, 1991) for the browser.
Same rules, content and spirit as the original; all assets recreated from scratch;
hi-res retro pixel-art presentation.

Reference material lives in `./reference` (original binaries, docs, DOSBox screenshots).
It is **read-only research input**: nothing from it is bundled or copied into the build.

---

## 1. Decisions (agreed with the user)

| Topic       | Decision                                                                                                                                                |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fidelity    | Inspired remake. Original is the design reference, not a pixel target.                                                                                  |
| Numbers     | Seed from tables readable in `BOMB.EXE` (prices, bundle sizes, names) + observing the original in DOSBox; tune the rest by playtesting. No disassembly. |
| Stack       | TypeScript + Vite + HTML5 Canvas 2D, no game framework. Vitest for tests.                                                                               |
| Visuals     | Hi-res retro pixel art: chunky pixels at a higher logical resolution, integer/crisp scaling, modern palette, animated backgrounds kept.                 |
| Assets      | Recreate everything: no original art, fonts, icons or sounds. Open-licensed fonts (e.g. OFL pixel fonts) are fine.                                      |
| Content     | All 18 weapons, 2 guidance systems, 2 shields, all 6 AIs, all game options. Data-driven so new weapons, AIs and backgrounds can be added.               |
| Players     | Hot-seat only, 2–10 tanks, any mix of humans and AIs.                                                                                                   |
| Input       | Keyboard + mouse on desktop **and** touch on mobile/tablet (responsive layout).                                                                         |
| Sound       | Synthesized with WebAudio in a PC-speaker spirit, no audio files. Optional "fly sound".                                                                 |
| Persistence | localStorage: settings, player roster, and resume of an unfinished set (between rounds).                                                                |
| Deploy      | Static build that runs from any host; picking a host is a late, optional stage.                                                                         |
| Workflow    | Small stages, each ending in something runnable and testable. **Stop for user review at every stage boundary.**                                         |

---

## 2. Architecture

### 2.1 Principles

1. **Simulation is separate from presentation.** `src/sim` is pure TypeScript: no DOM,
   no `Math.random`, no wall-clock time. It advances in fixed ticks and is fully
   deterministic given a seed + input sequence. This lets us unit-test physics/AI,
   run headless AI-vs-AI sets, and record/replay bugs.
2. **Seeded PRNG** (e.g. mulberry32/sfc32) is owned by the game state; every random
   decision (terrain, wind, duds, AI) draws from it.
3. **Fixed timestep** (60 ticks/s) with render interpolation; the sim never depends on frame rate.
4. **Data-driven content.** Weapons, items, AIs and backgrounds are registry entries
   (definition object + behavior function). Adding one shouldn't require touching the core loop.
5. **Pixel terrain.** The battlefield is a per-pixel material grid (`Uint8Array`: air,
   dirt, tank-occupied, etc.) plus a separate color layer, so craters, CRIs, dirt balls and
   crumbling all work per pixel.
6. **Everything on the canvas.** _(Revised in Stage 6; the original plan had DOM menus.)_ The
   playfield, HUD, overlays and all menu screens are canvas-rendered with the bitmap font and a
   small widget kit (`src/ui/widgets.ts`), driven by Pointer Events and the keyboard, so the look
   stays pixel-consistent. Text entry uses an off-screen `<input>` so soft keyboards and IME work.

### 2.2 Logical resolution

Original: 320×200 (16:10). Proposed playfield: **640×400 logical pixels** for the
battlefield (2× the original, so the proportions feel familiar), plus a HUD band. The whole
thing is scaled to the viewport with nearest-neighbor filtering. Mobile layout may move
HUD controls outside the playfield. Final choice is made in Stage 1 and recorded in WORKING_NOTES.

### 2.3 Proposed source layout

```
src/
  main.ts                 bootstrap, screen router
  core/                   loop (fixed step), rng, events, math, types
  sim/
    state.ts              GameState, RoundState, Player, Tank
    terrain.ts            material grid, generation, carving, filling, crumble
    physics.ts            projectile integration, wind, walls, collision
    turn.ts               turn/round state machine
    damage.ts             explosions, damage, death, debris
    weapons/              registry + one module per behavior family
    items/                guidance, shields
    ai/                   registry + one module per personality
    economy.ts            scoring, money, shop rules, starting inventory
  render/
    canvas.ts             scaler, offscreen buffers
    terrain-render.ts     background + terrain + trails
    sprites.ts            tank/turret/projectile drawing (procedural pixel art)
    fx.ts                 explosions, particles, laser, screen shake
    backgrounds/          animated sky styles
    hud.ts                top panel + equipment strip
  input/                  keyboard, mouse/pointer, touch controls → abstract commands
  ui/                     DOM screens: title, menu, player setup, status, shop, pause
  audio/                  WebAudio synth + SFX recipes
  persist/                localStorage schema + versioned migrations
tests/                    vitest unit + headless sim tests
e2e/                      Playwright smoke tests (added in Stage 0, grown per stage)
```

### 2.4 Input abstraction

All devices map to sim **commands** (`aimDelta`, `powerDelta`, `flipDirection`,
`nextWeapon`, `fire`, `toggleGuidance`, `selectTarget`, …). AI players emit the same
commands, which keeps human and AI paths identical and makes replays possible.

---

## 3. Stages

Each stage lists **Goal → Tasks → Done when**. "Done when" always includes: `npm run build`
passes, `npm test` passes, STATUS.md updated, user reviewed.

### Stage 0 — Project scaffold

**Goal:** an empty but well-wired project.

- `git init`, `.gitignore` (`reference/` is ignored: decided 2026-10-18).
- Vite + TypeScript (strict), ESLint + Prettier, Vitest, Playwright (one smoke test).
- `npm run dev | build | test | e2e | lint` scripts.
- Canvas scaler: logical-resolution canvas, nearest-neighbor, letterboxed, handles DPR and resize.
- Fixed-timestep loop with a debug overlay (FPS, tick count).
- Seeded RNG module with tests.
- **Done when:** dev server shows a scaled test pattern; the RNG is deterministic in tests.

### Stage 1 — Terrain & battlefield rendering

**Goal:** a generated landscape to look at.

- Lock the logical resolution and layout (record in WORKING_NOTES).
- Material grid + color layer; terrain generator (midpoint displacement / layered noise
  with the original's varied hills and cliffs; parameters exposed).
- Terrain renderer: dirt shading/texture, sky, playfield border.
- Carve/fill primitives: circle carve, circle fill (for dirt), arbitrary pixel ops.
- Debug keys: regenerate terrain, click to carve/fill.
- **Done when:** random terrains look good at several seeds; carving updates rendering efficiently (dirty rects).

### Stage 2 — Tanks, aiming, ballistics (first playable)

**Goal:** two humans on one keyboard can kill each other with a basic shell.

- Tank model: position, color, health ("men"), angle 0–180, power, direction.
- Placement: random order, spaced across the field, dropped from the sky and settled on the terrain (flatten a pad under each tank).
- Procedural tank + turret sprite at the new resolution.
- Projectile physics: gravity, wind, fixed-step integration, sub-stepping for fast shots; collision with terrain, tanks and the field bounds (off-screen = continue/abort for now).
- Basic explosion: carve a crater, radial damage falloff, tank death.
- Turn state machine: aim → fly → resolve → next player (left-to-right order, random first player); round ends when ≤1 tank remains.
- Keyboard: ←/→ angle, ↑/↓ power, PgUp/PgDn ±100, Alt/Shift fine step, `I` flip direction, Space/Enter fire.
- Minimal text HUD (angle, power, wind, current player).
- **Done when:** a full 2-player round is playable to a winner; unit tests cover the trajectory (no wind = symmetric parabola) and damage falloff.

### Stage 3 — Environment rules

**Goal:** every environmental game option works.

- Wind: levels None/Low/Standard/High/Gale/Random, rerolled per round, rare gusts (Standard up to ~800, Gale much higher).
- Walls: No (fly off and return; abort a shot that can't come back), Yes (reflect off all 4 walls), Random per round with an on-screen "R" indicator.
- Crumbling hills: after each shot, unsupported dirt falls with probability = crumble %. Animated column collapse.
- Tanks fall: unsupported tanks fall with damage proportional to distance; option to hover.
- Visible shot / shot trail options (trail in a dimmer shade of the player's color, kept for the round).
- **Done when:** each option is toggleable from a dev settings panel and covered by sim tests (e.g. rebound keeps the shot inside the bounds; crumble 0% never moves dirt).

### Stage 4 — HUD & full controls (desktop)

**Goal:** the play screen is feature-complete for keyboard and mouse.

- Top panel: Angle, Power, player name in player color, Direction arrow, Men, Wind with arrow.
- Equipment strip: 20 slots (18 weapons + H + V guidance) showing three states: not owned (dim), owned (white), armed (red), with counts. Shield indicator.
- Mouse: click/drag on the field to aim (modern addition), click the HUD values to adjust, click a strip slot to arm it, click a tank for its status, a fire button.
- Keyboard: Tab/Shift-Tab cycle weapon, `H`/`V` toggle guidance, digits 1–0 show player status.
- Global commands: pause + status overlay (original Ctrl-P), sound toggle (Ctrl-S), mass kill with confirmation (Ctrl-M), quit set with confirmation (Ctrl-Q). Pick browser-safe bindings (Ctrl-W/Q/P collide with the browser) and record them.
- Power capped by men (original: limited by MEN; exact formula to confirm by observation).
- **Done when:** everything in the original manual's CONTROLS section has an equivalent; key bindings are documented in-game (help overlay).

### Stage 5 — Weapon system & full arsenal

**Goal:** all 18 weapons behave distinctly.

- Weapon registry: `{id, name, shortName, price, bundle, icon, behavior, params}` (seed from WORKING_NOTES tables).
- Behaviors:
  - **Lead Ball:** no damage.
  - **Hand Grenade / Incinerator / Mark II / 20 Kt Nuke / 5 Mt Nuke:** fireball explosions with increasing radius and a matching fireball animation.
  - **Laser:** instant beam; the power value spends laser energy (1000 per purchase, minimum 100 to fire); reflects if walls rebound.
  - **CRIs (4/D, 8/ND, 8/D, 20/ND, 20/D):** a chain reaction eating through the ground. The number sets intensity/reach; "D" spreads more fluidly than "ND". Implement as a cellular spread over the material grid with tunable parameters.
  - **Sonic Blaster:** forces every piece of loose ground to collapse (crumble at 100% this once).
  - **Ball o' Dirt / Mark II / Compressed / Super-Compressed:** fill circles of dirt with increasing size.
  - **Explosive Dirt:** sprays dirt particles upward that land or hang depending on crumble.
- Duds: a small chance the shell bores through a tank without detonating.
- Tank death: debris/streamers that can hurt others ("Explosions Kill" option) and still carve terrain; several death styles (original: standard, death by dirt, fade away, nuclear meltdown).
- **Done when:** a debug arsenal mode gives every weapon; each has a sim test (crater area grows with tier; dirt adds material; CRI is bounded and terminates).

### Stage 6 — Game flow: title, menu, player setup, sets

**Goal:** the full loop from title to final results, minus the economy.

- Title screen: recreated art (procedural or hand-made pixel art of a tank firing over hills), attract animation, skip on any key.
- Main menu with every option from the manual (sound, fly sound, crumble %, walls, wind level, visible shot, trail, background, games per set 1–99, tanks fall, players 2–10, explosions kill, computers buy, background animation speed). Keyboard + mouse + touch.
- Player setup: per-slot Human/Computer, name entry, AI personality picker, stable player colors.
- Set loop: N rounds, new terrain/background/wind each round, rotate starting positions.
- Between-round status screen (rankings, score, wins) and final results screen.
- **Done when:** a multi-round set with mixed slots plays start to finish via the UI only.

### Stage 7 — Economy, shop, guidance & shields

**Goal:** money matters.

- Scoring and money: points for damage/kills, penalties for self/team damage; money derived from score (tune by observation).
- Starting inventory (v2.5 rules): 100 Lead Balls per set, 10 Hand Grenades and 3 Incinerators per game in the set.
- Shop screen per human with money: bundle price list, +/− selection, Purchase, Done (= purchase + exit), affordability indicator, "you currently have" counts.
- Guidance systems (Herb's = horizontal "H", Vick's = vertical "V"): pick a target, then the shot's trajectory is corrected toward it on that axis. Target picker by keys, click or tap.
- Shields: Energy Absorption Shield (absorbs blast damage) and Inertia Dampener (prevents fall damage). Interpretation to confirm by observing the original.
- **Done when:** a 10-game set shows money → purchases → item use working; economy rules have unit tests.

### Stage 8 — Computer opponents

**Goal:** the six AIs, plus purchasing.

- AI framework: each AI gets a read-only sim snapshot and returns a command sequence; it can run sim "probes" for planning, with a time budget.
- Personalities (from the manual):
  - **Mr. Stupid:** random angle/power, sometimes the wrong direction.
  - **Lobber:** two ranging shots at 75°, picks the target nearest its second impact, corrects power; confused by rebound and strong wind.
  - **Rifleman:** if below a target, points straight at it at full power; otherwise random.
  - **Windless Wit:** exact ballistic solution that ignores wind.
  - **Lob & Shoot:** Lobber without rebound, Rifleman with rebound.
  - **Twanger:** Rifleman without rebound; with rebound, banks shots off the ceiling and prefers easy kills.
  - Optional new AI (the binary mentions "Birdy Bonker", possibly an unlisted AI) as a proof of extensibility.
- AI weapon choice (no nuking adjacent targets), laser use, buying weapons/defenses when "Computers Can Buy" is on.
- Headless tournament harness: `npm run sim -- --ais ... --games 100` reports win rates. Use it to check the difficulty order.
- **Done when:** the AI-vs-AI harness runs fully headless and the ranking roughly matches the manual's threat descriptions.

### Stage 9 — Audio

**Goal:** satisfying retro sound with no asset files.

- WebAudio synth: square/noise oscillators, envelopes, pitch sweeps.
- SFX: fire, explosion tiers, laser, CRI crackle, dirt thud, tank fall, death, UI clicks, purchase.
- Optional fly sound (pitch follows altitude/speed), off by default.
- Master volume, mute toggle, and unlocking audio on the first user gesture.
- **Done when:** every event makes a sound, and sound/fly-sound options and the mute key work.

### Stage 10 — Touch & responsive layout

**Goal:** fully playable on phones and tablets.

- Responsive layout for landscape phones (prompt to rotate in portrait), tablets and desktop.
- Touch controls: drag on the field to set angle+power (with a ghost aim line), dedicated ± buttons, weapon carousel, fire button, a tap on a tank shows status.
- Touch-friendly menus, shop and name entry (virtual keyboard friendly).
- Pointer Events throughout; prevent scroll/zoom gestures on the playfield.
- **Done when:** a full set is playable on an iOS Safari and an Android Chrome viewport (Playwright mobile emulation + a manual check).

### Stage 11 — Persistence

**Goal:** nothing is lost on reload.

- Versioned localStorage schema: settings, roster (names, types, AI choices), unfinished set snapshot (saved at round boundaries).
- "Resume set" on the title/menu; "Restore defaults".
- **Done when:** reloading mid-set (between rounds) resumes correctly, and a corrupt or old save is handled gracefully.

### Stage 12 — Visual polish & backgrounds

**Goal:** the neon 1991 vibe, modernized.

- Animated backgrounds (registry): None, Starry Sky (twinkling), Color Bars (rising gradient bands), Circles o' Color (concentric rings pulsing from the center), Spreading Colors (rotating spiral), Blue Sky, and Random. Emulate palette cycling with shader-like canvas tricks or precomputed index buffers + a cycling LUT. Speed/off option (accessibility: reduced-motion respected by default).
- Particles, explosion flashes, screen shake (toggleable), tank fall dust, smoother turret animation.
- **Done when:** the backgrounds animate at 60 fps on a mid-range phone and reduced motion is honored.

### Stage 13 — Balance, QA & release prep

**Goal:** feels like Tank Wars, is robust.

- Side-by-side play sessions against the original in DOSBox; tune blast radii, wind, damage and economy, and record the final numbers in WORKING_NOTES.
- Performance pass (worst case: 10 tanks, CRI 20/D, 5 Mt nuke), memory, GC churn.
- Accessibility: color-blind-safe player colors / name labels, remappable keys (stretch).
- Error boundary and a "copy debug state" feature (seed + command log for replays).
- Production build and a static-hosting check (`vite preview`); optional PWA/offline; pick a host if wanted.
- **Done when:** the user signs off.

### Stretch / later

New weapons and AIs beyond the original set, replays/share-seed, online play (the deterministic sim makes it possible later), a level editor.

---

## 4. Testing strategy

- **Unit (Vitest):** rng, terrain ops, physics invariants, crumble, damage, economy, each weapon behavior, each AI's targeting in fixed scenarios.
- **Headless sim:** full rounds/sets with AI players on fixed seeds; snapshot the outcomes to catch unintended behavior changes.
- **E2E (Playwright):** smoke test per stage (load → menu → start → fire → round ends); mobile viewport from Stage 10.
- **Manual:** each stage ends with a short playtest script in STATUS.md.

## 5. Reference research (ongoing, no disassembly)

- Data already extracted from `BOMB.EXE` → see WORKING_NOTES.
- Run the original in `dosbox-staging` (installed at `/opt/homebrew/bin/dosbox-staging`) to observe behaviors that are still unclear (see Open Questions). It needs a `BOMB.CFG`, made with `BOMBCFG.EXE`. Do this inside a scratch copy of `reference/`, never in place.

## 6. Open questions (resolve when the stage arrives)

1. ~~Should `reference/` be committed?~~ Resolved: it is git-ignored.
2. Exact meaning of "Men" vs health and the power cap (the manual says power ≤ 100×MEN, but the screenshot shows Men: 99) → observe in DOSBox.
3. Scoring/money formula → observe.
4. Exact semantics of the shields and of Herb's vs Vick's guidance → observe.
5. Logical resolution: locked in Stage 1 at a 640×400 canvas with a 624×320 field. HUD placement on mobile is still open (Stage 10).
6. What "Birdy Bonker" is (an unlisted AI?) → optional curiosity, not required.
