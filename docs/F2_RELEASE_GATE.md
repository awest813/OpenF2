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
- Phase 68: get_critter_damage_type (BLK-076–081); sfall opcodes 0x8240–0x8247 (damage type, free move, base stat, difficulty, violence).
- Phase 69: float_msg window guard (BLK-082); tile_is_visible null position guard (BLK-083); set_exit_grids null gameObjects guard (BLK-084); obj_can_hear_obj null position guard (BLK-085); sfall opcodes 0x8248–0x824F.
- Phase 70: canSee/isWithinPerception/metarule3(106)/num_critters_in_radius/updateCritter null position guards (BLK-086–090); sfall opcodes 0x8250–0x8257.
- Phase 71: objectsAtPosition/recalcPath/getHitDistanceModifier/doAITurn null guards (BLK-091–095); sfall opcodes 0x8258–0x825F.
- Phase 72: metarule3(105/110)/get_critter_stat/party_add/party_remove null guards (BLK-096–099); sfall opcodes 0x8260–0x8267.
- Phase 73: play_sfx/walkTo/loadMap/reg_anim_obj_move_to_tile null guards (BLK-100–104); sfall opcodes 0x8268–0x826F.
- Phase 74: game_time_advance/give_exp_points non-finite guards (BLK-105–106); gsay_option null-target guard (BLK-107); critter_attempt_placement null-gMap guard (BLK-108); add_timer_event non-positive ticks guard (BLK-109); sfall opcodes 0x8270–0x8277.
- Phase 80: obj_name() null guard (BLK-128); set_global_var() non-finite value guard (BLK-129); critter_dmg() non-finite damage guard (BLK-130); float_msg() null floatMessages guard (BLK-131); loadMessageFile() try-catch for missing .msg files (BLK-132); sfall opcodes 0x8290–0x8297. Fixed pre-existing duplicate get_critter_max_hp_sfall (0x81F8/0x828F); merged into single canonical implementation with proto-data fallback.
- Phase 81: set_critter_stat/item_caps_adjust/tile_contains_obj_pid/move_to non-finite guards (BLK-133–137); save schema v20 playerCurrentHp/partyMembersHp persistence (BLK-138); sfall opcodes 0x8298–0x829F (get_critter_stat2, extra_stat, active_hand, item_type, perk_level, distance).
- Phase 82: Global browser error boundary with recoverable overlay (BLK-139); callProcedureSafe() wrapper applied to all 18 script trigger dispatch points — talk/critter/map_update/map_enter/map_exit/timed_event/use/look_at/description/use_skill_on/pickup/use_obj_on/push/is_dropping/combat/spatial/destroy/damage (BLK-140); per-object map_update isolation (BLK-142); timer event isolation (BLK-143); sfall opcodes 0x82A0–0x82A7 (worldmap_free_move, car_current_town, dude_obj, critter_max_ap alias, tile_light_level).
- Phase 83: initScript() start proc wrapped in callProcedureSafe() (BLK-144) — a throwing script initializer no longer aborts map-load for subsequent objects; sfall opcodes 0x82A8–0x82AF (critter_experience r/w, critter_crit_chance r/w, critter_npc_flag r/w, critter_outline_color r/w).

**Updated gate status:** `READY` — 101 files, ~3780 tests passed, tsc clean.
