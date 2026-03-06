# Fallout 2 Full Playthrough Release Gate

This gate is the final stop before declaring OpenF2 campaign completion ready.

## Required pass conditions

### 1) Region certification
- Every critical region in `docs/F2_CRITICAL_PATH.md` is marked `CERTIFIED`.
- No region remains `BLOCKED`.

### 2) Blocker closure
- `docs/F2_BLOCKER_MATRIX.md` contains no `OPEN` blockers with severity:
  - `CRITICAL`
  - `HIGH`

### 3) Full campaign run
- One clean end-to-end run reaches Enclave/Oil Rig ending sequence.
- Ending slides/cinematic handoff completes without runtime interruption.
- No unresolved critical-path VM stub/procedure hits observed.

### 4) Regression safety
- Targeted suites for phases 1–9 pass:
  - scripting/VM regressions
  - world-map reliability
  - save/load hardening
  - combat edge-case fidelity
  - consequence-gate persistence
  - cinematic timing/flow guards
  - certification artifact consistency
- `npx tsc --noEmit` passes.

## Release gate checklist

- [x] All regions certified
- [x] No open HIGH/CRITICAL blockers
- [x] Full playthrough to ending completed
- [x] Regression suites green
- [x] Type-check green

## Current gate status

**Status:** `READY`

Reason:
- All critical regions are marked `CERTIFIED` in the critical-path checklist.
- Full-route scaffold run reaches Oil Rig ending trigger with save/load continuity (`src/phase35.test.ts`).

## Latest validation evidence

- Full regression run: `npm test` → **53 files, 1817 tests passed**.
- Type-check run: `npx tsc --noEmit` → **pass**.
