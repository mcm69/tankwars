# Status

**Current stage:** Stage 0 — Project scaffold (complete, awaiting review)
**Next:** Stage 1 — Terrain & battlefield rendering
**Last updated:** 2026-10-18

See [PLAN.md](PLAN.md) for the full stage list. Update this file at the end of every work session
and at every stage boundary.

## Stage checklist

- [x] 0 — Project scaffold (awaiting review)
- [ ] 1 — Terrain & battlefield rendering
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

Stage 0 is done:

- git repo on `main`; `reference/` is git-ignored.
- Vite 8 + TypeScript 6.0 (strict), ESLint 10 + typescript-eslint, Prettier, Vitest 5, Playwright 1.64.
- Scripts: `dev`, `build` (type-check + bundle), `preview`, `test`, `test:watch`, `e2e`, `lint`, `format`.
- `src/core/rng.ts`: seeded sfc32 PRNG (`int`, `range`, `chance`, `pick`, `shuffle`, get/set state).
- `src/core/loop.ts`: pure `FixedStepper` (60 ticks/s, 250 ms catch-up clamp) + rAF `GameLoop` with an interpolation alpha.
- `src/render/screen.ts`: logical 640×400 canvas, nearest-neighbor, letterboxed. Uses an integer scale in device pixels when it fits, otherwise a fractional fit. Has `toLogical()` for pointer mapping.
- `src/render/debug-overlay.ts`: DOM FPS/ticks readout, toggled with F3 (shown by default in dev).
- `src/render/test-pattern.ts`: placeholder scene (1-px checker, grid, color bars, seeded hills, bouncing ball interpolated between ticks).
- Tests: 15 unit tests (rng, stepper, scale) + 1 Playwright smoke test; all pass.

## Implementation notes

- **TypeScript pinned to ~6.0**: TS 7 (the native port) is out, but typescript-eslint 8.71 supports only `<6.1`. Revisit when typescript-eslint supports 7.
- `noUncheckedIndexedAccess` is deliberately off: it makes typed-array pixel code noisy.
- The RNG test pins the first 3 outputs for seed 1991. If the algorithm changes, saves and replays break, so bump the save version.
- `window.__tankwars` is a read-only debug handle (currently `ticks`) used by e2e tests.
- The Vitest config lives in `vite.config.ts` (imported from `vitest/config`). Unit tests are in `tests/`, e2e tests in `e2e/`.
- `.claude/launch.json` defines the `dev` preview server (port 5173). Playwright uses `vite preview` on 4173.
- The logical resolution of 640×400 is still provisional; Stage 1 locks it.

## Playtest script for current stage

1. `npm install` (and `npx playwright install chromium` once for e2e).
2. `npm run dev`, then open http://localhost:5173. You should see a purple-bordered test pattern, crisp pixels, and a yellow ball bouncing smoothly.
3. Resize the window: the canvas stays centered and letterboxed, and the checker strip stays crisp at integer scales.
4. Press F3 to toggle the FPS/ticks overlay.
5. `npm test`, `npm run lint`, `npm run build` and `npm run e2e` should all pass.

## Known issues

_None._
