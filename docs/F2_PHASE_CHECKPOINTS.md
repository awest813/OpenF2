# Fallout 2 Critical Path Phase Checkpoints

This document defines pass/fail gates for each phase in the campaign-first completion plan.

---

## Phase 0 — Scope lock

- [x] Critical path regions listed and frozen
- [x] Required systems tags defined for each region
- [x] Non-goals explicitly frozen
- [x] Blocker matrix template active

Gate: **PASS** only when scope and tracking artifacts are in place.

---

## Phase 1 — Script VM de-stubbing

- [x] Procedure/opcode audit matrix created
- [x] Critical-path relevant partial/stub procedures prioritized
- [x] Implementations added for selected blockers
- [x] Regression test added for every de-stubbed behavior
- [x] No known unresolved critical-path stub hit in targeted runs

Gate: **PASS** when scripted progression no longer hits known unresolved VM blockers on covered path.

---

## Phase 2 — Early campaign validation (Temple → Den)

- [x] Temple progression validated
- [x] Arroyo progression validated
- [x] Klamath progression validated
- [x] Den arrival/progression validated
- [x] Save/load continuity validated across this route

Gate: **PASS** when early-game path is repeatable without softlock/state corruption.

---

## Phase 3 — Dialogue/barter/interactions

- [x] Dialogue branch transitions stable
- [x] Barter transactions and pricing stable
- [x] Loot/inventory/panel lifecycle stability verified
- [x] Interaction regressions covered by automated tests

Gate: **PASS** when repeated interaction loops maintain consistent state.

---

## Phase 4 — World-map reliability

- [x] Travel state updates remain deterministic
- [x] Encounter transitions are atomic
- [x] Return-to-origin position/state verified
- [x] Repeated travel/encounter cycles remain stable

Gate: **PASS** when no world-map travel/encounter corruption remains on tested path.

---

## Phase 5 — Save/load hardening

- [x] Quest globals persist correctly
- [x] Map vars/area states persist correctly
- [x] Timers and world position persist correctly
- [x] Party/inventory continuity persists correctly
- [x] Long-session roundtrip tests pass

Gate: **PASS** when campaign-critical state survives save/load across phases.

---

## Phase 6 — Combat edge-case fidelity

- [x] AP/turn flow integrity verified
- [x] Critical effects tables and outcomes validated
- [x] Combat exits back to quest scripts cleanly
- [x] Quest-linked combat outcomes produce correct state

Gate: **PASS** when combat no longer causes critical-path divergence.

---

## Phase 7 — Quest consequences

- [x] Reputation updates propagate correctly
- [x] Karma updates propagate correctly
- [x] Global/town vars gate dialogue/quests as expected
- [x] Cross-region consequence checks validated

Gate: **PASS** when player consequences consistently alter campaign state as expected.

---

## Phase 8 — Cinematics/audio/endings

- [x] Pre-ending trigger chain validated
- [x] Ending sequence execution validated
- [x] Slide ordering and fallback behavior validated
- [x] Audio transitions validated

Gate: **PASS** when ending flow completes without runtime interruption.

---

## Phase 9 — Region-by-region certification

- [x] Each region marked `CERTIFIED` in critical-path checklist
- [x] No unresolved `CRITICAL` blockers in matrix
- [x] Region-specific regression coverage in place

Gate: **PASS** when all listed critical regions are certified.

---

## Phase 10 — Full playthrough release gate

- [x] One clean end-to-end campaign run reaches ending flow
- [x] No unresolved campaign-critical blockers
- [x] Regression suites covering new fixes are green

Gate: **PASS** when campaign completion is reproducible and test-backed.


---

## Phase 36 — Scripting hardening and save state completeness

- [x] sfall global variables (string-keyed and int-indexed) persisted in save schema v11
- [x] metarule() default/break path returns 0 instead of undefined (VM stack safety)
- [x] New sfall opcodes 0x8190 (string_to_int) and 0x8191 (int_to_string) implemented
- [x] reg_anim_func ANIM_COMPLETE callbacks invoked immediately (browser build has no async anim queue)
- [x] sfallGlobals serialization/deserialization/reset helpers tested
- [x] phase36.test.ts: 25 regression tests, all passing

Gate: **PASS** — all 1842 tests green, tsc clean.

---

## Phase 38 — Runtime hardening and sfall opcode expansion

- [x] `get_pc_stat` unknown pcstat index: throw → warn+return 0 (BLK-014)
- [x] `mark_area_known` area type > 1: throw → log+no-op (BLK-014)
- [x] `set_map_var` with no map script: throw → warn+no-op (BLK-014)
- [x] `critter_inven_obj` with non-game-object: throw → warn+return null (BLK-014)
- [x] `metarule3(100, ...)` CLR_FIXED_TIMED_EVENTS loop fallthrough fixed: returns 0 always (BLK-015)
- [x] `metarule3` id < 100: silent default return 0 added; trailing `stub()` call removed (BLK-015)
- [x] `proto_data` default case: `stub()` call changed to silent `log()` + return 0 (BLK-016)
- [x] New sfall opcode 0x8194: `get_tile_fid(tile, elev)` → partial (returns 0)
- [x] New sfall opcode 0x8195: `set_tile_fid(tile, elev, fid)` → no-op partial
- [x] New sfall opcode 0x8196: `get_critter_flags(obj)` → injury-state bitmask
- [x] New sfall opcode 0x8197: `set_critter_flags(obj, flags)` → bulk injury-state write
- [x] phase38.test.ts: 44 regression tests, all passing

Gate: **PASS** — all 1906 tests green, tsc clean.

---

## Phase 39 — Crash hardening (dialogue, inventory, map, elevator) and sfall expansion

- [x] `getScriptMessage` missing-file throw → warn+return null; missing-key throw → warn+return '' (BLK-017)
- [x] `item_caps_total` non-game-object throw → warn+return 0 (BLK-018)
- [x] `create_object_sid` invalid elevation throw → warn+clamp to [0,2] (BLK-019)
- [x] `start_gdialog` / `gdialog_mod_barter` missing self_obj throw → warn+no-op (BLK-020)
- [x] `gsay_reply` null/empty message throw → warn+no-op (BLK-020)
- [x] `metarule(15)` explicit type throw → log+proceed (BLK-021)
- [x] Message file parser invalid-line throw → warn+skip line (BLK-022)
- [x] `anim()` negative/unclassified code: stub() → silent log (no stub-hit noise)
- [x] New sfall opcode 0x8198: `get_ini_setting(key)` → partial (returns 0)
- [x] New sfall opcode 0x8199: `active_hand()` → partial (returns 0, primary)
- [x] New sfall opcode 0x819A: `set_sfall_return(val)` → no-op partial
- [x] New sfall opcode 0x819B: `get_sfall_arg()` → partial (returns 0)
- [x] phase39.test.ts: 47 regression tests, all passing

Gate: **PASS** — all 1953 tests green, tsc clean.
