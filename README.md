# Tank Wars

A browser remake of **Tank Wars**, Kenny Morse's 1990 DOS artillery game. From 2 to 10 tanks
take turns lobbing shells across destructible hills: humans in hot-seat play, plus six
computer personalities. All 18 weapons, guidance systems and shields from the original are
here, along with crumbling hills, rebounding walls and gale-force wind. The animated
backgrounds emulate VGA palette cycling.

Everything is recreated: the pixel art, the bitmap font and the synthesized sound effects. No
original game files are included.

## Playing

Open the page, press any key, then **Start**. The main menu sets the number of players, games
per set and wind; everything else is under **Options**. Each player is a human or a computer
(Mr. Stupid, Lobber, Rifleman, Windless Wit, Lob & Shoot, Twanger, or Random). Between games,
spend your winnings in the shop.

| Keys            | Action                        |
| --------------- | ----------------------------- |
| ← →             | tilt the barrel (hold = fast) |
| ↑ ↓             | power ±1 (hold = fast)        |
| PgUp PgDn       | power ±100                    |
| Shift + key     | single steps, no repeat       |
| I               | flip direction                |
| Space / Enter   | fire                          |
| Tab / Shift+Tab | next / previous weapon        |
| H V             | Herb's / Vick's guidance      |
| 1–9, 0          | player status                 |
| Esc / P         | pause and game status         |
| S               | sound on/off                  |
| K               | mass kill (asks first)        |
| Q               | quit the game (asks first)    |
| F9              | copy debug info (bug reports) |

**Mouse:** drag on the field to aim: the direction from your turret sets the angle, and the
distance sets the power. Click the HUD's arrows and weapons, and use the wheel for power.
**Touch:** play in landscape. The side panels hold big angle, power, weapon and FIRE buttons,
and dragging on the field aims.

Settings, players and an unfinished set are saved in your browser, so a reload offers
**Resume**. Once loaded, the game also works offline.

There's an easter egg from the original, too. Try a shot at full health with power exactly
800, preferably with walls on.

## Development

Requires Node 22+.

```bash
npm install
npm run dev        # dev server at http://localhost:5173
npm test           # unit tests (Vitest)
npm run e2e        # end-to-end tests (Playwright, builds and serves the production bundle)
npm run lint       # ESLint + Prettier check
npm run sim        # headless AI tournament
npm run build      # production build into dist/
```

Dev URLs: `?play` skips the menus (`&players=4&cpu=2&ai=lobber&seed=7&arsenal&walls=on&bg=stars`
and more; see `src/main.ts`). `?lab` opens the terrain lab, and F3 toggles the debug readout.

**Bug reports:** F9 in battle (or "Copy debug info" on the crash screen) copies a JSON report
holding the round's seed, settings and full command log. `npm run replay -- report.json`
replays it headlessly to the same state, rethrowing any crash.

Project docs: [PLAN.md](PLAN.md) (stages), [STATUS.md](STATUS.md) (progress and known issues),
and [WORKING_NOTES.md](WORKING_NOTES.md) (design decisions and gotchas).

## Deploying

`npm run build` produces a fully static site in `dist/`. It uses relative paths, so it works
from any host and any subpath (GitHub Pages, Netlify, an S3 bucket, `python3 -m http.server`).
Serve it over HTTPS (or localhost) for offline support and "add to home screen".

**GitHub Pages:** `.github/workflows/deploy.yml` lints, tests, builds and publishes `dist/` on
every push to `main` (or by hand from the Actions tab). One-time setup: in the repository's
Settings → Pages, set the source to "GitHub Actions". The game then lives at
`https://<user>.github.io/<repo>/`.

## Credits

Original Tank Wars © 1990 Kenny Morse. This is an unofficial fan remake for fun and
preservation.
