# Fallout 2 Full Playthrough Release Gate

This gate is the final stop before declaring OpenF2 campaign completion ready.

## Required pass conditions

### 1) Region certification
- Every critical region in `docs/F2_CRITICAL_PATH.md` is marked `CERTIFIED`.
- No region remains `BLOCKED`.
- Certification must satisfy the **real-asset rule** in that document (not scaffold-only).

### 2) Blocker closure
- `docs/F2_BLOCKER_MATRIX.md` contains no `OPEN` blockers with severity:
  - `CRITICAL`
  - `HIGH`
- Tier 0 / Tier 1 issues in `docs/F2_PARITY_ISSUES.md` are closed.

### 3) Full campaign run
- One clean end-to-end run reaches Enclave/Oil Rig ending sequence.
- Ending slides/cinematic handoff completes without runtime interruption.
- No unresolved critical-path VM stub/procedure hits observed.
- The run must exercise real maps/scripts (or an opt-in asset-gated automated equivalent),
  not only synthetic global-assignment harnesses.

### 4) Regression safety
- Targeted suites for phases 1–9 pass:
  - scripting/VM regressions
  - world-map reliability
  - save/load hardening
  - combat edge-case fidelity
  - consequence-gate persistence
  - cinematic timing/flow guards
  - certification artifact consistency
- Asset-dependent suites skip cleanly when assets are absent; they pass when present.
- `npx tsc --noEmit` passes.

## Release gate checklist

- [ ] All regions certified (real-asset rule)
- [ ] No open HIGH/CRITICAL blockers (matrix + parity issue Tier 0/1)
- [ ] Full playthrough to ending completed (real content)
- [ ] Regression suites green on clean checkout
- [ ] Type-check green

## Current gate status

**Status:** `NOT_READY`

Reason:
- Region checklist reset to `NOT_STARTED` after audit showed prior `CERTIFIED` /
  `READY` claims were backed by synthetic scaffolds (`phase35`, `campaignSmoke`),
  not real map/script execution.
- Measured suite @ `cbcb8d1`: **5103 passed / 61 failed** (117/122 files). Failures
  are concentrated in asset-absent script corpora (`phase100`, `phase107`) plus
  `get_tile_fid` regressions.
- Tier 0 parity gaps remain open: no new-game/chargen flow, dual character model,
  Skilldex 2/8, no real-asset certification evidence. See `docs/F2_PARITY_ISSUES.md`
  and `docs/F2_FULL_PARITY_PLAN.md`.

## Latest validation evidence

- Full regression run: `npm test` → **5103 passed / 61 failed** (122 files).
- Type-check run: `./node_modules/.bin/tsc --noEmit` → **pass**.
- Scaffold suites (`phase26`/`phase34`/`phase35`) still pass as state-machine smoke;
  they are **not** treated as campaign completion evidence.
- Crash-hardening and sfall surface through Phase 109 remain valuable foundation work;
  they do not substitute for Tier 0 playability systems.

**Plan of record for reaching READY:** `docs/F2_FULL_PARITY_PLAN.md`.
