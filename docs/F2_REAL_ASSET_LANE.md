/**
 * Opt-in real-asset test lane (parity Slice E / P0-4).
 *
 * Clean checkouts without a converted Fallout 2 install stay green: asset suites
 * **skip**. This document is the runbook for proving Arroyo scripts on a legal install.
 *
 * ## 1. Convert a legal Fallout 2 install
 *
 * ```bash
 * python setup.py /path/to/Fallout2
 * ```
 *
 * That extracts `master.dat` / `critter.dat`, converts FRMs → `art/`, protos →
 * `proto/pro.json`, maps → `maps/*.json`, and leaves scripts under `data/scripts/*.int`.
 *
 * Minimum for the Arroyo script smoke:
 * - `data/scripts/artemple.int`
 * - `data/scripts/arvillag.int`
 * - (ideally the full Arroyo set listed in `src/phase100.test.ts`)
 *
 * ## 2. Run the opt-in suites
 *
 * ```bash
 * # Focused Slice E + Phase 100 Arroyo corpora (skips cleanly if assets missing)
 * npm run test:assets:arroyo
 *
 * # Broader first-three-areas + related corpora
 * npx vitest run src/phase100.test.ts src/phase107.test.ts src/phase109.test.ts
 * ```
 *
 * ## 3. What “pass” means
 *
 * - Every listed `.int` parses without throw
 * - `map_enter_p_proc` / other lifecycle procs run under ScriptVM without hard crash
 *   (`failOnUnknownVmOpcode=false`, matching production)
 * - `get_tile_fid` / `set_tile_fid` round-trip against `lut/tiles.lst` or a full
 *   `data/art/tiles/tiles.lst` export
 *
 * ## 4. Certification rule
 *
 * Region `CERTIFIED` in `docs/F2_CRITICAL_PATH.md` requires this lane (or an equivalent
 * real-map playthrough), not scaffold-only smoke. See `docs/F2_FULL_PARITY_PLAN.md`.
 */
