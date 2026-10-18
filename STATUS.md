# Status

**Current stage:** Stage 1 — Terrain & battlefield rendering (complete, awaiting review)
**Next:** Stage 2 — Tanks, aiming, ballistics (first playable)
**Last updated:** 2026-10-18

See [PLAN.md](PLAN.md) for the full stage list. Update this file at the end of every work session
and at every stage boundary.

## Stage checklist

- [x] 0 — Project scaffold
- [x] 1 — Terrain & battlefield rendering (awaiting review)
- [ ] 2 — Tanks, aiming, ballistics (first playable)
- [ ] 3 — Environment rules
- [ ] 4 — HUD & full controls (desktop)
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

Stage 1 is done:

- **Layout locked**: a 640×400 canvas holds a 64-px HUD band on top and a 624×320 playfield at (8, 72), with a 1-px border just outside the field. `FIELD_WIDTH`/`FIELD_HEIGHT` are in `src/sim/constants.ts`; `LAYOUT` is in `src/config.ts`.
- `src/sim/terrain.ts`: `Terrain` holds a `Uint8Array` material grid (`Material.Air`/`Dirt`) with `get`/`set`/`isSolid`/`surfaceY`/`fillFromSurface`/`carveCircle`/`fillCircle`, and dirty-rect tracking (`takeDirty`). Out of bounds counts as air.
- `src/sim/terrain-gen.ts`: deterministic generator with 5 styles (rolling, jagged, plateaus, valley, mountain). It uses midpoint displacement plus per-style shaping (bowl, terraces with per-seed step and shelf variation, detail noise), a median despike, smoothing, and clamps to a surface band of 18–90% of field height.
- `src/render/terrain-renderer.ts`: offscreen ImageData renderer that repaints only the dirty rect, extended 2 rows down so edge highlights stay right. It gives dirt depth bands dithered by a stable per-pixel hash and draws a 2-px surface highlight. `renderSky()` draws a banded gradient.
- `src/render/themes.ts`: 5 color themes (meadow, desert, mars, tundra, neon).
- `src/scenes/terrain-lab.ts`: debug scene that replaced the Stage 0 test pattern (which was removed).
- Tests: 32 unit tests (17 new terrain tests) + 2 e2e tests (new: clicking carves terrain); all pass.

## Implementation notes

- **TypeScript pinned to ~6.0**: TS 7 (the native port) is out, but typescript-eslint 8.71 supports only `<6.1`. Revisit when typescript-eslint supports 7.
- `noUncheckedIndexedAccess` is deliberately off: it makes typed-array pixel code noisy.
- No `const enum` (it doesn't mix with `isolatedModules` and esbuild). Use the `as const` object + type pattern, as `Material` does.
- The RNG test pins the first 3 outputs for seed 1991. If the algorithm changes, saves and replays break, so bump the save version.
- Terrain colors are not stored. They come from position (depth band + hash) at render time, so dirt added by weapons automatically matches.
- The theme choice uses its own RNG stream (`seed ^ 0x5eed`) so presentation never consumes sim randomness. In Stage 6 the theme becomes part of round setup.
- `window.__tankwars` is a read-only debug handle (currently `ticks`) used by e2e tests. `?seed=N` in the URL sets the lab seed.
- The Vitest config lives in `vite.config.ts` (imported from `vitest/config`). Unit tests are in `tests/`, e2e tests in `e2e/`.
- `.claude/launch.json` defines the `dev` preview server (port 5173). Playwright uses `vite preview` on 4173.

## Playtest script for current stage

1. `npm run dev`, then open http://localhost:5173 (optionally `?seed=42`).
2. Press **R** a few times: each press gives a new terrain and theme. Press **S** to cycle styles (the last step returns to random) and **T** to cycle themes.
3. Drag with the left button to carve tunnels. Right-drag or Shift-drag fills dirt, which can float in the sky (crumbling comes in Stage 3). Use the wheel or **[ ]** to resize the brush.
4. Check that edge highlights follow the new surfaces and that the FPS (F3) stays at 60 while carving with a big brush.

## Known issues

- The plateaus style can still leave an occasional 3–4 px wide spike. That's acceptable; tank placement will flatten pads in Stage 2.
- A fast drag in the lab carves at sampled pointer positions only (gaps possible). It's a debug tool, so this is fine.
