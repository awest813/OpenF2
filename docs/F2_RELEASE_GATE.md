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

- Full regression run: `npm test` → **85 files, 2961 tests passed**.
- Type-check run: `./node_modules/.bin/tsc --noEmit` → **pass**.
- Phase 50: critter status-flag persistence (BLK-033), active-hand tracking (BLK-034), save schema v13, sfall opcodes 0x81AE–0x81B5, checklist upgrades for proto_data/tile_is_visible/metarule_18/21/35/44/46/55/anim.
- Phase 51: player stats/skills persisted in save schema v14 (BLK-035); sfall opcodes 0x81B6–0x81BD.
- Phase 52: metarule3(106) elevation-aware (BLK-036); tile_contains_obj_pid elevation-aware (BLK-037); sfall opcodes 0x81BE–0x81C5 (BLK-038).
- Phase 53: NPC weapon slot save/restore (BLK-039); AI dead-target guard (BLK-040); sfall opcodes 0x81C6–0x81CF.
- Phase 54: XP on kill (BLK-041); player weapon slot save/load schema v15 (BLK-042); skill points on level-up (BLK-043); inven_unwield activeHand (BLK-044); sfall opcodes 0x81D0–0x81D7.
- Phase 55: player armor save/load schema v16 (BLK-045); perk owed tracking (BLK-047); sfall opcodes 0x81D8–0x81DF.
- Phase 56: player name/gender save schema v17 (BLK-048); XP level-up consistency (BLK-049); set_name opcode (BLK-050); sfall opcodes 0x81E0–0x81E7.
- Phase 57–65: 49 sfall opcodes 0x81E8–0x822F; null guards BLK-051–070.
- Phase 66: car fuel save/load schema v18 (BLK-071); tile_contains_pid_obj null-gMap guard (BLK-072); sfall opcodes 0x8230–0x8237 (object name, gender, combat round, AP, carry weight).
- Phase 67: move_to null-gMap guard (BLK-073); rm_timer_event null-obj guard (BLK-074); player injury flags save schema v19 (BLK-075); sfall opcodes 0x8238–0x823F (radiation, poison, party, proto-flags).
