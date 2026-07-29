# AGENTS.md

OpenF2 is a browser-first, open-source reimplementation of the Fallout 2 engine written in TypeScript + WebGL. The single "service" is the browser game plus a Python asset-conversion pipeline. See `README.md` and `CONTRIBUTING_ROADMAP.md` for architecture and module layout.

## Cursor Cloud specific instructions

### Standard commands (already documented, not repeated here)
- Build, test, and run commands are in `README.md` (Contributing → Build + test) and `package.json` scripts.
- Lint uses `.eslintrc.js`; there is no `lint` npm script, so run `npx eslint src --ext .ts`.
- CI runs only the UI2 gameplay smoke suite (`.github/workflows/ui2-gameplay.yml`): `UI2_ONLY_GAMEPLAY_PANELS='1' npx vitest run src/ui2/panelParity.test.ts`.

### Core dev loop
- Tests are the primary way to exercise engine functionality: `npm test` (Vitest, ~5100+ tests).
- Compile to `js/` with `npx tsc` before serving `play.html` (the HTML loads `js/main.js`). `js/` is gitignored, so it must be rebuilt after a clean checkout.
- Serve the browser app from the repo root with `python3 -m http.server` and open `http://localhost:8000/play.html?<mapname>`.

### Non-obvious gotchas
- The browser game CANNOT fully load without proprietary Fallout 2 assets. The `art/`, `proto/`, `data/`, and most of `maps/` are gitignored and must be generated from a legal Fallout 2 install via `pipenv run python setup.py /path/to/Fallout2`. Without them, `play.html` boots the engine shell but fails while loading fonts/art (e.g. `RangeError: structure larger than remaining buffer` from parsing 404 responses) and shows the in-engine "Game Error" recovery overlay. That overlay is a real engine feature (browser error boundary in `src/main.ts`), not a build break.
- Because assets are absent in cloud, validate changes with the Vitest suite (and, for GUI/panel logic, `src/ui2/panelParity.test.ts`) rather than expecting a fully rendered game in the browser.
- Around 61 tests fail out of the box (Phase 100/101/107 script-parity suites). These are pre-existing known gaps from missing proto/script data, documented in `README.md` (Known Test Gaps), and are not caused by environment setup.
- The Python pipeline (`Pipfile`: numpy, pillow) is only needed for asset conversion and is not required to build/test/run the TypeScript engine.
