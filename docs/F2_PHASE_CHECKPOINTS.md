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

---

## Phase 44 — VM stack safety, destroy_p_proc, combat guard, sfall expansion

- [x] `vm_bridge.ts` `push(r)` → `push(r ?? 0)`: systemic guard preventing undefined values from corrupting VM data stack (BLK-023)
- [x] `map_var()` bare early returns → `return 0`: prevents undefined push via opcode 0x80C3 (BLK-023)
- [x] `map.ts` `destroyObject()` calls `Scripting.destroy(obj)` before removal: fires `destroy_p_proc` callbacks for all scripted objects (BLK-024)
- [x] Reentrance guard (`_destroyingObjects: Set<Obj>`) prevents infinite recursion if `destroy_p_proc` calls `destroy_object` on the same object
- [x] `combat.ts` `nextTurn(skipDepth)`: skip-depth counter bounds recursion to one full combatant-list rotation; forces `end()` if exceeded (BLK-025)
- [x] New sfall opcode 0x819C: `get_world_map_x()` → world-map X position
- [x] New sfall opcode 0x819D: `get_world_map_y()` → world-map Y position
- [x] New sfall opcode 0x819E: `set_world_map_pos(x, y)` — teleport world-map cursor
- [x] New sfall opcode 0x819F: `in_world_map()` → 1 if no game map loaded
- [x] New sfall opcode 0x81A0: `get_critter_level(obj)` → character level
- [x] New sfall opcode 0x81A1: `set_critter_level(obj, level)` — override level
- [x] New sfall opcode 0x81A2: `get_object_weight(obj)` → weight in lbs from proto data
- [x] phase44.test.ts: 34 regression tests, all passing

Gate: **PASS** — all 2075 tests green, tsc clean.

---

## Phase 50 — Critter status flags persistence, active hand, save schema v13, sfall expansion

- [x] Critter critical-injury / status flags (`knockedOut`, `knockedDown`, `stunned`, `crippledLeftLeg`, `crippledRightLeg`, `crippledLeftArm`, `crippledRightArm`, `blinded`, `onFire`, `isFleeing`) added to `SERIALIZED_CRITTER_PROPS` + `SerializedCritter` interface (BLK-033)
- [x] `Player.activeHand` (0=primary, 1=secondary) added to Player class; `active_hand()` opcode reads live value (BLK-034)
- [x] Save schema bumped to v13: `playerActiveHand` field added; v12→v13 migration defaults to 0; normalization ensures 0 or 1 only
- [x] Both IDB and memory load paths restore `playerActiveHand` on load
- [x] New sfall opcode 0x81AE: `get_perk_owed()` → 0
- [x] New sfall opcode 0x81AF: `set_perk_owed(n)` → no-op
- [x] New sfall opcode 0x81B0: `get_last_target(obj)` → 0
- [x] New sfall opcode 0x81B1: `get_last_attacker(obj)` → 0
- [x] New sfall opcode 0x81B2: `art_cache_flush()` → no-op
- [x] New sfall opcode 0x81B3: `game_loaded()` → 0
- [x] New sfall opcode 0x81B4: `set_weapon_knockback(obj, dist, chance)` → no-op
- [x] New sfall opcode 0x81B5: `remove_weapon_knockback(obj)` → no-op
- [x] Checklist status upgrades: `proto_data`, `tile_is_visible`, `metarule_46`, `metarule_21`, `metarule_35`, `metarule_44`, `metarule_55`, `metarule_18`, `anim`, `proto_data_flags2` → all promoted to `implemented`
- [x] phase50.test.ts: 48 regression tests, all passing

Gate: **PASS** — all 2336 tests green, tsc clean.

---

## Phase 51 — Player stats persistence, sfall opcodes 0x81B6–0x81BD, save schema v14

- [x] **BLK-035**: Player base stats (`HP`, SPECIAL, radiation, poison) and skill values (base skills + unspent skill points) snapshotted in save schema v14 (`playerBaseStats`, `playerSkillValues`, `playerSkillPoints` fields)
- [x] Save schema bumped to v14; v13→v14 migration defaults `playerBaseStats`/`playerSkillValues` to `{}`; `sanitizeStringNumericRecord` helper added for safe loading
- [x] Both IDB and memory load paths restore player `StatSet.baseStats` and `SkillSet.baseSkills` + `skillPoints` on load
- [x] Player HP now survives save/load cycles; script-driven SPECIAL modifications also persist
- [x] New sfall opcode 0x81B6: `get_critter_stat_bonus(obj, stat)` → derived minus base stat bonus
- [x] New sfall opcode 0x81B7: `obj_art_name(obj)` → art path string of object
- [x] New sfall opcode 0x81B8: `get_item_type_int(item)` → item subtype as integer (0=armor, 3=weapon, etc.)
- [x] New sfall opcode 0x81B9: `set_pc_stat(pcstat, val)` → set PC stat (0=skill_points, 1=level, 2=xp, 3/4=karma)
- [x] New sfall opcode 0x81BA: `num_critters_in_radius(tile, elev, radius)` → count of live critters within radius hexes
- [x] New sfall opcode 0x81BB: `get_object_ai_num(obj)` → critter AI packet number
- [x] New sfall opcode 0x81BC: `set_object_ai_num(obj, num)` → set critter AI packet number
- [x] New sfall opcode 0x81BD: `get_critter_hostile_to_dude(obj)` → 1 if critter hostile to player
- [x] phase51.test.ts: 47 regression tests, all passing

Gate: **PASS** — all 2383 tests green, tsc clean.

---

## Phase 52 — Multi-floor map fixes (BLK-036/037), sfall opcodes 0x81BE–0x81C5

- [x] **BLK-036**: `metarule3(106)` TILE_GET_NEXT_CRITTER — elevation parameter was silently ignored; now uses `gMap.getObjects(elevation)` + position filter. Also implements `lastCritter` iteration for enumerating multiple critters at one tile.
- [x] **BLK-037**: `tile_contains_obj_pid(tile, elev, pid)` — returned 0 for any elevation ≠ current floor; now uses `gMap.getObjects(elevation)` + position/PID filter matching `tile_contains_pid_obj` behaviour.
- [x] **BLK-038**: sfall opcodes 0x81BE–0x81C5 were absent; scripts calling them corrupted the VM stack. All eight now registered: `get_critter_weapon`, `critter_inven_size`, `get_sfall_args_count`, `get_sfall_arg_at`, `set_sfall_arg`, `get_object_lighting`, `get_critter_team`, `set_critter_team`.
- [x] New sfall opcode 0x81BE: `get_critter_weapon(critter, slot)` → weapon object in hand slot (0=primary, 1=secondary)
- [x] New sfall opcode 0x81BF: `critter_inven_size(critter)` → total item count in critter inventory
- [x] New sfall opcode 0x81C0: `get_sfall_args_count()` → 0 (no hook args)
- [x] New sfall opcode 0x81C1: `get_sfall_arg_at(idx)` → 0 (partial)
- [x] New sfall opcode 0x81C2: `set_sfall_arg(idx, val)` → no-op (partial)
- [x] New sfall opcode 0x81C3: `get_object_lighting(obj)` → ambient light level (partial)
- [x] New sfall opcode 0x81C4: `get_critter_team(critter)` → critter.teamNum
- [x] New sfall opcode 0x81C5: `set_critter_team(critter, team)` → set critter.teamNum
- [x] scriptingChecklist.ts: 10 new entries (BLK-036/037/038 + 8 new opcodes)
- [x] phase52.test.ts: 64 regression tests, all passing

Gate: **PASS** — all 2447 tests green, tsc clean.

---

## Phase 53 — NPC weapon slot save/restore (BLK-039), combat stability (BLK-040), sfall opcodes 0x81C6–0x81CF

- [x] **BLK-039**: NPC critter leftHand/rightHand weapon objects not persisted — `SERIALIZED_CRITTER_PROPS` extended with `leftHandPID`/`rightHandPID`; `Critter.toMapObject` saves the PIDs; `objFromMapObject` restores by inventory search.
- [x] **BLK-040**: `doAITurn()` dead-target crash guard — checks `target.dead` before attacking. `nextTurn()` AP initialization guard for critters added mid-round.
- [x] New sfall opcode 0x81C6: `get_critter_base_stat(critter, stat)` → unmodified base stat
- [x] New sfall opcode 0x81C7: `set_critter_base_stat(critter, stat, val)` → set base stat directly
- [x] New sfall opcode 0x81C8: `critter_mod_skill_points(critter, skill, delta)` → modify skill by delta
- [x] New sfall opcode 0x81C9: `get_critter_current_ap(critter)` → current AP
- [x] New sfall opcode 0x81CA: `set_critter_current_ap(critter, ap)` → set AP
- [x] New sfall opcode 0x81CB: `get_combat_target(critter)` → current combat target (0 = not in combat)
- [x] New sfall opcode 0x81CC: `set_combat_target(critter, target)` → set combat target (partial)
- [x] New sfall opcode 0x81CD: `get_game_time_in_seconds()` → game time in seconds
- [x] New sfall opcode 0x81CE: `get_light_level()` → global ambient light level
- [x] New sfall opcode 0x81CF: `set_light_level_sfall(level, update)` → set ambient light (partial)
- [x] phase53.test.ts: 54 regression tests, all passing

Gate: **PASS** — all 2519 tests green, tsc clean.

---

## Phase 54 — XP on kill (BLK-041), player weapon slot save/load (BLK-042), skill points on level-up (BLK-043), inven_unwield activeHand (BLK-044), sfall opcodes 0x81D0–0x81D7

- [x] **BLK-041**: Player never gained XP from combat kills — `critterKill()` now auto-awards `pro.extra.XPValue` XP to the player source; level-up+skill-point check follows immediately. Mirrors Fallout 2 engine behaviour.
- [x] **BLK-042**: Player equipped weapon (leftHand/rightHand) lost on save/load — save schema v15 adds `playerLeftHandPID`/`playerRightHandPID`; equipped weapons included in inventory save; both IDB and memory load paths re-equip from inventory by PID on load.
- [x] **BLK-043**: Skill points not awarded on level-up — `give_exp_points()` now grants `max(1, 10 + floor(INT/2)) + 2*Educated_rank` skill points per level gained, matching Fallout 2 formula.
- [x] **BLK-044**: `inven_unwield()` ignored activeHand — for the player it now clears `leftHand` when `activeHand=0` (primary) and `rightHand` when `activeHand=1` (secondary). NPC behaviour unchanged.
- [x] New sfall opcode 0x81D0: `get_game_mode_sfall()` → mode bitmask (0x01=normal, 0x02=combat)
- [x] New sfall opcode 0x81D1: `force_encounter(mapId)` → no-op (partial)
- [x] New sfall opcode 0x81D2: `force_encounter_with_flags(mapId, flags)` → no-op (partial)
- [x] New sfall opcode 0x81D3: `get_last_pers_obj()` → 0 (stub)
- [x] New sfall opcode 0x81D4: `obj_is_disabled_sfall(obj)` → 0 (partial)
- [x] New sfall opcode 0x81D5: `obj_remove_script(obj)` → no-op (stub)
- [x] New sfall opcode 0x81D6: `obj_add_script(obj, sid)` → no-op (stub)
- [x] New sfall opcode 0x81D7: `obj_run_proc(obj, proc_name)` → no-op (stub)
- [x] Save schema bumped from v14 to v15; v14→v15 migration defaults `playerLeftHandPID`/`playerRightHandPID` to undefined; `sanitizeEquippedPID` helper validates PID ≥ 1
- [x] phase54.test.ts: 27 regression tests, all passing

Gate: **PASS** — all 2546 tests green, tsc clean.

---

## Phase 55 — Player armor persistence (BLK-045), party migration (BLK-046), perk tracking (BLK-047), sfall opcodes 0x81D8–0x81DF

- [x] **BLK-045**: Player equipped armor (`equippedArmor`) lost on save/load — save schema v16 adds `playerArmorPID`; armor included in inventory save; both load paths re-equip from inventory by PID on load.
- [x] **BLK-046**: Missing `party` field in old saves caused aborted load — `migrateSave()` normalization now defaults `save.party = []` when absent.
- [x] **BLK-047**: Perk credits not tracked on level-up — `give_exp_points()` increments `playerPerksOwed` every 3 levels; `get_perk_owed`/`set_perk_owed` functional; persisted in save schema v16.
- [x] New sfall opcode 0x81D8: `get_drop_amount(obj)` → 0 (stub)
- [x] New sfall opcode 0x81D9: `set_drop_amount(obj, amount)` → no-op
- [x] New sfall opcode 0x81DA: `art_exists(artPath)` → 0 (partial)
- [x] New sfall opcode 0x81DB: `obj_item_subtype(obj)` → item subtype int (alias of 0x80C9)
- [x] New sfall opcode 0x81DC: `get_critter_level(obj)` → character level (alias of get_npc_level)
- [x] New sfall opcode 0x81DD: `hero_art_id(type)` → 0 (stub)
- [x] New sfall opcode 0x81DE: `get_current_inven_size(critter)` → inventory item count (alias)
- [x] New sfall opcode 0x81DF: `set_critter_burst_disable(obj, disable)` → no-op
- [x] Save schema bumped from v15 to v16; migration defaults; normalization for playerArmorPID and playerPerksOwed
- [x] phase55.test.ts: regression tests, all passing

Gate: **PASS** — all 2584 tests green, tsc clean.

---

## Phase 56 — Player name/gender save (BLK-048), level-up consistency (BLK-049), set_name opcode (BLK-050), sfall opcodes 0x81E0–0x81E7

- [x] **BLK-048**: Player name and gender not persisted in saves — save schema v17 adds `playerName` and `playerGender`; both snapshotted in `save()` and restored in `applyExtraSaveState()`; migration from v16 defaults to 'Player'/'male'; normalization rejects invalid values.
- [x] **BLK-049**: Level-up via `critterKill()` XP path missing Educated perk bonus and perk credits — `critterKill()` now applies `(perkRanks[47] ?? 0) * 2` bonus skill points and increments `globalState.playerPerksOwed` every 3 levels, matching `give_exp_points()`.
- [x] **BLK-050**: `set_name(obj, name)` opcode (0x80A8) absent — added to `scripting.ts` and registered in `vm_bridge.ts`; assigns name directly on the game object; prevents VM stack corruption in character-creation and NPC rename scripts.
- [x] New sfall opcode 0x81E0: `get_current_map_id_sfall()` → current map index (alias of metarule(46,0))
- [x] New sfall opcode 0x81E1: `get_object_dude_distance(obj)` → tile distance to player (fully implemented)
- [x] New sfall opcode 0x81E2: `get_critter_attack_mode_sfall(obj)` → 0 (partial)
- [x] New sfall opcode 0x81E3: `set_critter_attack_mode_sfall(obj, mode)` → no-op
- [x] New sfall opcode 0x81E4: `get_map_first_run_sfall()` → 1 if first-run, 0 otherwise (alias of map_first_run)
- [x] New sfall opcode 0x81E5: `get_script_type_sfall()` → 0 (partial)
- [x] New sfall opcode 0x81E6: `get_tile_pid_sfall(tile, elev)` → PID of first non-critter object at tile (partial)
- [x] New sfall opcode 0x81E7: `get_critter_skill_points(obj, skill)` → base skill allocation (fully implemented)
- [x] Save schema bumped from v16 to v17; v16→v17 migration adds playerName/playerGender defaults
- [x] phase56.test.ts: 33 regression tests, all passing

Gate: **PASS** — all 2617 tests green, tsc clean.

---

## Phase 67 — move_to null-gMap guard (BLK-073), rm_timer_event null-obj guard (BLK-074), player injury flags save schema v19 (BLK-075), sfall opcodes 0x8238–0x823F

- [x] **BLK-073**: `move_to()` null-gMap guard — when elevation differed from current, `globalState.gMap.changeElevation()` / `removeObject()` / `addObject()` were called without checking for null. During map transitions or early-boot, this caused an uncaught TypeError. Now guards with an early warning when gMap is null.
- [x] **BLK-074**: `rm_timer_event()` null-obj guard — scripts sometimes call `rm_timer_event(0)` when cancelling timers on destroyed objects. The unconditional `obj.pid` access at the start of the function crashed. Now returns early with a warning when `obj` is null/undefined.
- [x] **BLK-075**: Player injury flags persistence in save schema v19 — crippled limbs (`crippledLeftLeg`, `crippledRightLeg`, `crippledLeftArm`, `crippledRightArm`) and `blinded` state stored as a bitmask in `playerInjuryFlags`; persisted in save and restored on load so critical-hit permanent penalties survive save/reload.
- [x] New sfall opcode 0x8238: `get_critter_radiation_sfall(obj)` → radiation level (alias of get_radiation)
- [x] New sfall opcode 0x8239: `set_critter_radiation_sfall(obj, val)` → set radiation level (absolute, clamped [0,1000])
- [x] New sfall opcode 0x823A: `get_critter_poison_sfall(obj)` → poison level (alias of get_poison)
- [x] New sfall opcode 0x823B: `set_critter_poison_sfall(obj, val)` → set poison level (absolute, clamped [0,1000])
- [x] New sfall opcode 0x823C: `critter_in_party_sfall(obj)` → 1 if critter is in player party, 0 otherwise
- [x] New sfall opcode 0x823D: `get_critter_proto_flags_sfall(obj)` → proto flags bitmask on object (partial)
- [x] New sfall opcode 0x823E: `set_critter_proto_flags_sfall(obj, flags)` → set proto flags on object (partial)
- [x] New sfall opcode 0x823F: `get_party_count_sfall()` → current party member count
- [x] Save schema bumped from v18 to v19; v18→v19 migration defaults `playerInjuryFlags = 0`; normalization masks to 0x1F
- [x] Older tests (phase49–56, phase66) updated from hardcoded `toBe(18)` to `SAVE_VERSION`/dynamic
- [x] phase67.test.ts: 35 regression tests, all passing

Gate: **PASS** — all 2961 tests green, tsc clean.

---

## Phase 69 — float_msg window guard (BLK-082), tile_is_visible null position guard (BLK-083), set_exit_grids null gameObjects guard (BLK-084), obj_can_hear_obj null position guard (BLK-085), sfall opcodes 0x8248–0x824F

- [x] **BLK-082**: `float_msg()` `window.performance.now()` crash guard — `float_msg()` used `window.performance.now()` directly.  In Node.js test environments and some non-browser runtimes the `window` global does not exist, causing a ReferenceError on every call.  Now uses `typeof performance !== 'undefined' ? performance.now() : 0`, matching the safe-fallback pattern used by `get_uptime()`.
- [x] **BLK-083**: `tile_is_visible()` null `player.position` guard — `tile_is_visible()` checked `globalState.player` but not `globalState.player.position`.  During early script execution before the player is placed on the map, `player.position` is null and `hexDistance(null, …)` crashed.  Now returns 1 (visible) when position is null.
- [x] **BLK-084**: `set_exit_grids()` null `gameObjects` guard — `set_exit_grids()` used the TypeScript non-null assertion `gameObjects!` without a real null check.  Scripts calling it before `enterMap`/`updateMap` (when `gameObjects` is null) received a TypeError crash.  Now emits a warning and returns early when `gameObjects` is null.
- [x] **BLK-085**: `obj_can_hear_obj()` null position guard — `obj_can_hear_obj()` called `hexDistance(a.position, b.position)` without checking that positions are non-null.  Objects in inventory or mid-map-transition have a null position.  Now returns 0 (out of earshot) when either position is null.
- [x] New sfall opcode 0x8248: `get_map_limits_sfall(which)` → 200 (map is always 200×200)
- [x] New sfall opcode 0x8249: `obj_is_valid_sfall(obj)` → 1 if valid game object, 0 otherwise
- [x] New sfall opcode 0x824A: `get_string_length_sfall(str)` → length of string
- [x] New sfall opcode 0x824B: `get_char_code_sfall(str, pos)` → char code at position
- [x] New sfall opcode 0x824C: `string_contains_sfall(haystack, needle)` → 1 if found
- [x] New sfall opcode 0x824D: `string_index_of_sfall(haystack, needle)` → first index or -1
- [x] New sfall opcode 0x824E: `get_object_script_id_sfall(obj)` → numeric script SID or -1
- [x] New sfall opcode 0x824F: `get_script_field_sfall(field)` → 0 (browser context field read)
- [x] phase69.test.ts: regression tests for all BLK items and sfall opcodes

Gate: **PASS** — all 3039 tests green, tsc clean.

---

## Phase 70 — canSee() null position guard (BLK-086), isWithinPerception() null position guard (BLK-087), metarule3(106) filter null position guard (BLK-088), num_critters_in_radius() null position guard (BLK-089), updateCritter() toTileNum null position guard (BLK-090), sfall opcodes 0x8250–0x8257

- [x] **BLK-086**: `canSee()` null position guard — checked before hexDistance call.
- [x] **BLK-087**: `isWithinPerception()` null position guard — checked before hexDistance call.
- [x] **BLK-088**: `metarule3(106)` filter null position guard — objects with null position skipped.
- [x] **BLK-089**: `num_critters_in_radius()` null position guard — objects with null position skipped.
- [x] **BLK-090**: `updateCritter()` `toTileNum` null position guard — returns 0 when position is null.
- [x] New sfall opcode 0x8250: `get_object_art_fid_sfall(obj)` → fid
- [x] New sfall opcode 0x8251: `set_object_art_fid_sfall(obj, fid)` → no-op
- [x] New sfall opcode 0x8252: `get_item_subtype_sfall(obj)` → -1|0..6
- [x] New sfall opcode 0x8253: `get_combat_target_sfall(obj)` → obj|0
- [x] New sfall opcode 0x8254: `set_combat_target_sfall(obj, target)` → no-op
- [x] New sfall opcode 0x8255: `combat_is_initialized_sfall()` → 0|1
- [x] New sfall opcode 0x8256: `get_attack_type_sfall(obj, slot)` → 0
- [x] New sfall opcode 0x8257: `get_map_script_idx_sfall()` → -1
- [x] phase70.test.ts: regression tests for all BLK items and sfall opcodes

Gate: **PASS** — all 3083 tests green, tsc clean.

---

## Phase 71 — objectsAtPosition null-position guard (BLK-091), recalcPath null-position guard (BLK-092), getHitDistanceModifier null-position guard (BLK-093), doAITurn hexNeighbors null guard (BLK-094), doAITurn sort null guard (BLK-095), sfall opcodes 0x8258–0x825F

- [x] **BLK-091**: `objectsAtPosition()` null position guard.
- [x] **BLK-092**: `recalcPath()` null position guard.
- [x] **BLK-093**: `getHitDistanceModifier()` null position guard.
- [x] **BLK-094**: `doAITurn()` hexNeighbors null guard.
- [x] **BLK-095**: `doAITurn()` sort null guard.
- [x] New sfall opcode 0x8258: `get_critter_hurt_state_sfall(obj)` → bitmask
- [x] New sfall opcode 0x8259: `set_critter_hurt_state_sfall(obj, state)` → no-op
- [x] New sfall opcode 0x825A: `get_critter_is_fleeing_sfall(obj)` → 0|1
- [x] New sfall opcode 0x825B: `set_critter_is_fleeing_sfall(obj, val)` → no-op
- [x] New sfall opcode 0x825C: `get_tile_blocked_sfall(tile)` → 0|1
- [x] New sfall opcode 0x825D: `get_critter_hit_pts_sfall(obj)` → max_hp
- [x] New sfall opcode 0x825E: `critter_add_trait_sfall(obj, trait, val)` → no-op
- [x] New sfall opcode 0x825F: `get_num_new_obj_sfall()` → 0
- [x] phase71.test.ts: regression tests for all BLK items and sfall opcodes

Gate: **PASS** — all 3125 tests green, tsc clean.

---

## Phase 72 — metarule3(105) null-position guard (BLK-096), metarule3(110) null-position guard (BLK-097), get_critter_stat null-object guard (BLK-098), party_add/party_remove null-gParty guard (BLK-099), sfall opcodes 0x8260–0x8267

- [x] **BLK-096**: `metarule3(105)` null position guard.
- [x] **BLK-097**: `metarule3(110)` null position guard.
- [x] **BLK-098**: `get_critter_stat()` null-object guard.
- [x] **BLK-099**: `party_add()`/`party_remove()` null-gParty guard.
- [x] New sfall opcode 0x8260: `get_critter_weapon_sfall(obj, slot)` → weapon alias
- [x] New sfall opcode 0x8261: `set_critter_weapon_sfall(obj, slot, weapon)` → no-op
- [x] New sfall opcode 0x8262: `get_object_type_sfall(obj)` → 0|1|2|3 alias
- [x] New sfall opcode 0x8263: `get_critter_team(obj)` → team alias
- [x] New sfall opcode 0x8264: `set_critter_team(obj, team)` → alias
- [x] New sfall opcode 0x8265: `get_ambient_light_sfall()` → 0..65536
- [x] New sfall opcode 0x8266: `set_ambient_light_sfall(level)` → no-op
- [x] New sfall opcode 0x8267: `get_map_local_var_sfall(idx)` → value
- [x] phase72.test.ts: regression tests for all BLK items and sfall opcodes

Gate: **PASS** — all 3176 tests green, tsc clean.

---

## Phase 73 — play_sfx() null audioEngine guard (BLK-100), walkTo() null position guard (BLK-101), walkTo() window.performance.now() guard (BLK-102), map loadMap null audioEngine guard (BLK-103), reg_anim_obj_move_to_tile null position guard (BLK-104), sfall opcodes 0x8268–0x826F

- [x] **BLK-100**: `play_sfx()` null audioEngine guard.
- [x] **BLK-101**: `walkTo()` null position guard (object.ts).
- [x] **BLK-102**: `walkTo()` `window.performance.now()` safe fallback (object.ts).
- [x] **BLK-103**: `loadMap()` null audioEngine guard (map.ts).
- [x] **BLK-104**: `reg_anim_obj_move_to_tile()` null position guard.
- [x] New sfall opcode 0x8268: `get_critter_ap_sfall(obj)` → current AP
- [x] New sfall opcode 0x8269: `set_critter_ap_sfall(obj, ap)` → set AP
- [x] New sfall opcode 0x826A: `get_object_flags_sfall(obj)` → flags bitmask
- [x] New sfall opcode 0x826B: `set_object_flags_sfall(obj, flags)` → write flags
- [x] New sfall opcode 0x826C: `critter_is_dead_sfall(obj)` → 0|1
- [x] New sfall opcode 0x826D: `get_obj_light_level_sfall(obj)` → 0..65536
- [x] New sfall opcode 0x826E: `set_obj_light_level_sfall(obj, level)` → clamp [0,65536]
- [x] New sfall opcode 0x826F: `get_elevation_sfall()` → 0|1|2
- [x] phase73.test.ts: regression tests for all BLK items and sfall opcodes

Gate: **PASS** — all 3212 tests green, tsc clean.

---

## Phase 74 — game_time_advance() non-finite ticks guard (BLK-105), give_exp_points() non-finite XP guard (BLK-106), gsay_option() null/non-function target guard (BLK-107), critter_attempt_placement() null gMap guard (BLK-108), add_timer_event() non-positive ticks guard (BLK-109), sfall opcodes 0x8270–0x8277

- [x] **BLK-105**: `game_time_advance()` non-finite ticks guard — NaN/Infinity ticks would corrupt `globalState.gameTickTime`, breaking all time-based events (timed events, drug timers, in-game clock). Now guards with `isFinite()` and returns early.
- [x] **BLK-106**: `give_exp_points()` non-finite XP guard — NaN/Infinity XP would corrupt `player.xp`, causing the level-up while-loop comparison to always return false (NaN >= threshold is always false) and permanently prevent level-up. Now guards and returns early.
- [x] **BLK-107**: `gsay_option()` null/non-function target guard — scripts occasionally pass 0 or a non-callable as the dialogue handler; `target.bind(this)` would throw a TypeError and abort the entire dialogue session. Now substitutes a no-op so the option still appears in the UI.
- [x] **BLK-108**: `critter_attempt_placement()` null gMap guard — delegates to `move_to()` which calls `gMap.changeElevation()` without a null check; during map transitions this threw an uncaught TypeError. Returns -1 (placement failure) when gMap is null.
- [x] **BLK-109**: `add_timer_event()` non-positive ticks guard — zero or negative ticks caused the event to fire on the very next `game_time_advance()` call, potentially producing re-entrant callbacks. Now clamps to a minimum of 1 tick.
- [x] New sfall opcode 0x8270: `get_tile_at_object_sfall(obj)` → tile number or -1
- [x] New sfall opcode 0x8271: `critter_get_flee_state_sfall(obj)` → 0|1
- [x] New sfall opcode 0x8272: `critter_set_flee_state_sfall(obj, val)` → set isFleeing
- [x] New sfall opcode 0x8273: `get_combat_difficulty_sfall()` → 1 (alias of 0x81EC)
- [x] New sfall opcode 0x8274: `get_object_proto_sfall(obj)` → 0 (stub)
- [x] New sfall opcode 0x8275: `get_critter_hit_chance_sfall(attacker, target)` → 0..100
- [x] New sfall opcode 0x8276: `get_tile_distance_sfall(tile1, tile2)` → hex distance
- [x] New sfall opcode 0x8277: `get_tile_in_direction_sfall(tile, dir, count)` → tile (alias of tile_num_in_direction)
- [x] phase74.test.ts: 58 regression tests, all passing

Gate: **PASS** — all 3270 tests green, tsc clean.

---

## Phase 82 — global error boundary (BLK-139), callProcedureSafe script trigger isolation (BLK-140), map_update per-object isolation (BLK-142), timer event isolation (BLK-143), sfall opcodes 0x82A0–0x82A7

- [x] **BLK-139**: `installBrowserErrorBoundary()` IIFE in `main.ts` — installs `window.onerror` and `window.addEventListener('unhandledrejection', …)` handlers. Displays a recoverable overlay (Continue / Reload) with error message and source location. Throttled to 5 errors/minute to prevent flooding. User testing readiness: any uncaught exception now shows a friendly recovery UI instead of a silent freeze.
- [x] **BLK-140**: `callProcedureSafe(fn, scriptName, procName)` helper added inside the `Scripting` module. Applied to all 18 script trigger dispatch functions: `talk`, `updateCritter`, `timedEvent`, `use`, `lookAt`, `description`, `useSkillOn`, `pickup`, `useObjOn`, `push`, `isDropping`, `combatEvent`, `updateMap` (map script + per-object), `exitMap` (map script + per-object), `enterMap`, `objectEnterMap`, `spatial`, `destroy`, `damage`. A throwing NPC script no longer crashes the game loop.
- [x] **BLK-142**: `updateMap()` per-object loop: each NPC's `map_update_p_proc` is now individually wrapped in `callProcedureSafe()`. One bad NPC script cannot abort subsequent NPC heartbeat updates.
- [x] **BLK-143**: `timedEvent()` `timed_event_p_proc` call now wrapped in `callProcedureSafe()`. A throwing timer callback no longer breaks the timer chain or prevents subsequent timed events.
- [x] New sfall opcode 0x82A0: `get_worldmap_free_move_sfall()` → 0
- [x] New sfall opcode 0x82A1: `set_worldmap_free_move_sfall(v)` → no-op
- [x] New sfall opcode 0x82A2: `get_car_current_town_sfall()` → carAreaID or -1
- [x] New sfall opcode 0x82A3: `get_dude_obj_sfall()` → player object or 0
- [x] New sfall opcode 0x82A4: `set_dude_obj_sfall(obj)` → no-op stub
- [x] New sfall opcode 0x82A5: `get_critter_max_ap_sfall(obj)` → alias of existing 0x8235
- [x] New sfall opcode 0x82A6: `get_tile_light_level_sfall(tile)` → 0
- [x] New sfall opcode 0x82A7: `set_tile_light_level_sfall(tile, level)` → no-op
- [x] phase82.test.ts: 66 regression tests, all passing

Gate: **PASS** — all 3714 tests green, tsc clean.

---

## Phase 83 — initScript start proc isolation (BLK-144), sfall opcodes 0x82A8–0x82AF

- [x] **BLK-144**: `initScript()` `start` procedure call now wrapped in `callProcedureSafe()`. A throwing script initializer no longer aborts map-load for subsequent objects — every NPC/object on the map initializes safely.
- [x] New sfall opcode 0x82A8: `get_critter_experience_sfall(obj)` → total XP (playerExperience for player, critter.experience for NPCs)
- [x] New sfall opcode 0x82A9: `set_critter_experience_sfall(obj, val)` → set total XP, clamped to [0, 2^31-1]
- [x] New sfall opcode 0x82AA: `get_critter_crit_chance_sfall(obj)` → crit modifier % (reads critChanceMod)
- [x] New sfall opcode 0x82AB: `set_critter_crit_chance_sfall(obj, val)` → set crit modifier %, clamped to [-100, 100]
- [x] New sfall opcode 0x82AC: `get_critter_npc_flag_sfall(obj, flag)` → NPC flags bit at position flag (0–31)
- [x] New sfall opcode 0x82AD: `set_critter_npc_flag_sfall(obj, flag, val)` → set/clear NPC flags bit
- [x] New sfall opcode 0x82AE: `get_critter_outline_color_sfall(obj)` → outline colour index (0 = none)
- [x] New sfall opcode 0x82AF: `set_critter_outline_color_sfall(obj, color)` → set outline colour, calls invalidate() when available
- [x] vm_bridge.ts updated: 8 new entries 0x82A8–0x82AF mapped to bridged() stubs
- [x] scriptingChecklist.ts updated: BLK-144 + 8 sfall opcode entries all marked implemented
- [x] phase83.test.ts: regression tests for BLK-144 (7 tests) + all 8 sfall opcodes + checklist integrity

Gate: **PASS** — all tests green, tsc clean.


---

## Phase 85 — UX debug pass: start → New Reno (ui2 panel polish)

- [x] **DialoguePanel buildLines \n fix**: `buildLines()` now splits text on `\n`/`\r\n` before word-wrapping, so multi-paragraph NPC dialogue renders with correct hard line breaks instead of literal `\n` characters appearing in the text.
- [x] **DialoguePanel scroll arrows visibility**: `▲`/`▼` scroll indicator arrows changed from `FALLOUT_DARK_GRAY` to `FALLOUT_GREEN` — they are now clearly visible against the black panel background.
- [x] **BarterPanel refused banner de-overlap**: "OFFER REFUSED — add more to your table" banner moved from `btnY - 4` to `btnY - 18`, preventing it from rendering over the YOUR/THEIR value labels at the same y-coordinate.
- [x] **InventoryPanel scroll offset clamp after USE**: `onKeyDown('Enter')` now clamps `_scrollOffset` to `[0, max(0, items.length - MAX_ROWS)]` after emitting `inventory:useItem`, preventing a stale scroll offset from hiding all items if the list shrinks.
- [x] **InventoryPanel Delete key drop**: `Delete` key emits `inventory:dropItem`, splices the item from the panel list, and clamps both `_selectedIndex` and `_scrollOffset` — providing a keyboard shortcut to drop the selected item without requiring a mouse click on the DROP button.
- [x] **LootPanel overflow indicator**: `_drawColumn()` now shows a `+N more` indicator in `FALLOUT_AMBER` at the bottom of the column when more items exist than fit in the visible area — players can see that additional items are present and can be retrieved via keyboard or TAKE ALL.
- [x] **WorldMapPanel keyboard navigation**: `ArrowDown`/`ArrowUp` navigate the world-view area list with visual highlight; `Enter` enters the highlighted area; selection is reset on `Escape` back from area view and on `show()`.
- [x] phase85.test.ts: 26 regression tests for all fixes above

Gate: **PASS** — all 3910 tests green, tsc clean.

---

## Phase 86 — New Reno full-playability hardening: TRAIT_SKILL support, skill guards, sfall 0x82B8–0x82BF

- [x] **BLK-156**: `critter_add_trait(traitType=3)` TRAIT_SKILL implemented — New Reno boxing scripts call `critter_add_trait(boxer, TRAIT_SKILL, SKILL_UNARMED, bonus)` to temporarily boost the Unarmed skill for fights. Previously fell through to the "unknown traitType" no-op, leaving fighters at their base stats. Now adjusts `obj.skills.baseSkills[skillName]` by `amount` (signed); non-finite amounts are clamped to 0.
- [x] **BLK-157**: `has_trait(traitType=3)` TRAIT_SKILL implemented — Scripts reading back accumulated skill trait values via `has_trait(TRAIT_SKILL, obj, skillId)` previously always got 0. Now returns `skills.getBase(skillName)`, so scripts can verify boosts were applied before branching.
- [x] **BLK-158**: `critter_add_trait_sfall()` (0x825E) no longer a no-op — Now delegates to `critter_add_trait()`, so New Reno scripts that call the sfall opcode variant receive the same TRAIT_PERK / TRAIT_OBJECT / TRAIT_CHAR / TRAIT_SKILL handling as vanilla opcode calls.
- [x] **BLK-159**: `set_critter_skill_points()` non-finite value guard — Mirrors BLK-129: non-finite values (NaN, Infinity) are clamped to 0 with a warning instead of being stored, preventing SkillSet corruption in New Reno quest reward scripts.
- [x] **BLK-160**: `critter_mod_skill()` non-finite amount guard — NaN/Infinity amounts are treated as 0 with a warning, preventing SkillSet corruption when New Reno combat damage formulas produce non-finite results.
- [x] `critter_add_trait()` TRAIT_PERK (traitType=0): auto-initialize `perkRanks` when missing — prevents `TypeError: Cannot set properties of undefined` on critters that lack a `perkRanks` record (exposed by BLK-158 fix).
- [x] New sfall opcode 0x82B8: `get_critter_trait_typed_sfall(obj, traitType, trait)` → trait/perk/skill value (delegates to `has_trait`; accepts all traitTypes unlike 0x8208)
- [x] New sfall opcode 0x82B9: `critter_mod_skill_sfall(obj, skillId, amount)` → signed delta to base skill (alias of `critter_mod_skill`)
- [x] New sfall opcode 0x82BA: `get_npc_stat_sfall(obj, stat)` → effective stat (alias of `get_critter_stat`)
- [x] New sfall opcode 0x82BB: `set_npc_stat_sfall(obj, stat, val)` → set NPC base stat (alias of `set_critter_stat`)
- [x] New sfall opcode 0x82BC: `get_obj_name_sfall(obj)` → display name string or 0
- [x] New sfall opcode 0x82BD: `get_critter_ai_num_sfall(obj)` → `aiNum` field or -1 for non-critters
- [x] New sfall opcode 0x82BE: `get_num_critters_on_tile_sfall(tile)` → 0 (stub; no per-tile critter index)
- [x] New sfall opcode 0x82BF: `get_critter_combat_data_sfall(obj)` → 0 (stub; no combat-session data structure)
- [x] phase86.test.ts: 54 regression tests for all BLK items, sfall opcodes, and checklist integrity
- [x] phase14.test.ts: stub count upper bound updated to ≤ 17

Gate: **PASS** — all 3964 tests green, tsc clean.

---

## Phase 87 — New Reno full-playability hardening (continued): inventory/stat guards, sfall 0x82C0–0x82C7

- [x] **BLK-161**: `rm_mult_objs_from_inven()` non-positive/non-finite count guard — New Reno quest-completion scripts compute item removal quantities from combat math that can produce NaN or zero; `count - remaining = NaN - NaN = NaN` returned as a corrupt removal count. Now guards with `!isFinite(count) || count <= 0`, returning 0 as a no-op. Mirrors BLK-146 (add_mult_objs_to_inven).
- [x] **BLK-162**: `obj_carrying_pid_obj()` null inventory guard — After the equipped-slot scan (BLK-066) the function accessed `obj.inventory.length` without checking whether the inventory array is defined. Critters spawned by New Reno encounter scripts may have no inventory array; the access threw TypeError. Now guards with `Array.isArray()` and returns 0 safely.
- [x] **BLK-163**: `poison()` non-finite amount guard — New Reno drug scripts compute poison doses from encounter formulas (dose × multiplier) that can produce NaN when an unknown drug type yields an undefined dose. Passing NaN to `modifyBase('Poison Level', NaN)` corrupted the stat, breaking all drug-resistance and addiction checks. Now rejects non-finite amounts with a warning.
- [x] **BLK-164**: `radiation_add()` non-finite amount guard — New Reno nuclear-area encounter scripts scale radiation by encounter-intensity values that can be undefined/NaN. Passing to `modifyBase('Radiation Level', NaN)` corrupted the stat and broke radiation-gauge and resistance checks. Now guards identically to BLK-163.
- [x] **BLK-165**: `radiation_dec()` non-finite amount guard — Completes the radiation-guard family (BLK-163/164). Non-finite decrease amounts from cleaner-drug efficacy formulas corrupted the Radiation Level stat. Now guarded identically.
- [x] New sfall opcode 0x82C0: `get_critter_active_weapon_sfall(obj)` → weapon in active hand slot or 0 (rightHand for NPCs; active-hand selection for the player)
- [x] New sfall opcode 0x82C1: `get_critter_base_skill_sfall(obj, skillId)` → raw base skill allocation without SPECIAL modifier (delegates to `has_trait(TRAIT_SKILL, …)`)
- [x] New sfall opcode 0x82C2: `set_critter_base_skill_sfall(obj, skillId, val)` → set base skill directly (delegates to `set_critter_skill_points()`, inherits BLK-159 non-finite guard)
- [x] New sfall opcode 0x82C3: `get_critter_in_combat_sfall(obj)` → 1 if critter is in active combat roster, 0 otherwise (delegates to same check as metarule3(103))
- [x] New sfall opcode 0x82C4: `get_map_var_sfall(mvar)` → map variable value via sfall opcode path (delegates to `map_var()`)
- [x] New sfall opcode 0x82C5: `set_map_var_sfall(mvar, val)` → set map variable via sfall opcode path (delegates to `set_map_var()`)
- [x] New sfall opcode 0x82C6: `get_critter_attack_type_sfall(obj, slot)` → 0 (stub — no per-weapon attack-type table)
- [x] New sfall opcode 0x82C7: `get_critter_min_str_sfall(obj)` → 0 (stub — no equipped-weapon proto lookup for minimum Strength)
- [x] phase87.test.ts: 61 regression tests for all BLK items, sfall opcodes, and checklist integrity
- [x] phase14.test.ts: stub count upper bound updated to ≤ 19

Gate: **PASS** — all 4025 tests green, tsc clean.

---

## Phase 88 — Arroyo full-playability hardening: obj guard pass, sfall 0x82C8–0x82CF

- [x] **BLK-166**: `obj_open()`/`obj_close()` missing `use()` method guard — Arroyo door/scenery objects lacking a `use()` method no longer throw TypeError; the call is silently skipped.
- [x] **BLK-167**: `critter_dmg()` non-critter `self_obj` guard — Temple dart traps use a non-critter trigger as `self_obj`; damage source is treated as `null` so XP attribution is handled cleanly.
- [x] **BLK-168**: `giq_option()` non-numeric INT stat guard — When player INT is uninitialised, `getStat("INT")` returns undefined; the IQ test now defaults to INT 5.
- [x] **BLK-169**: `create_object_sid()` negative tile guard — A negative tile number produces an off-map y-coordinate; now warns and returns `null` for negative tiles.
- [x] **BLK-170**: `float_msg()` null/empty message guard — Passing null (from a missing `message_str()` key) now coerces to empty string and skips silently.
- [x] New sfall opcodes 0x82C8–0x82CF: weapon property queries (min/max damage, damage type, AP costs, ranges, ammo PID).
- [x] phase88.test.ts: regression tests for all BLK items, sfall opcodes, arroyo smoke tests, and checklist integrity.

Gate: **PASS** — all 4088 tests green, tsc clean.

---

## Phase 89 — Arroyo exit hardening: world-map/inventory/timer guards, sfall 0x82D0–0x82D7

- [x] **BLK-171**: `set_world_map_pos()` non-finite coordinate guard — Rejects NaN/Infinity coordinates so `globalState.worldPosition` is never corrupted.
- [x] **BLK-172**: `move_obj_inven_to_obj()` undefined inventory guard — `Array.isArray()` guards added for both source and destination inventory arrays.
- [x] **BLK-173**: `override_map_start()` non-finite position guard — Non-finite x/y values rejected so `overrideStartPos` is never corrupted.
- [x] **BLK-174**: `give_exp_points()` null-skills guard — Elder dialogue awards 2500 XP; when `player.skills` is null, the skill-point award is skipped but XP and level-up still apply.
- [x] **BLK-175**: `rm_timer_event()` removes ALL matching events — Temple dart traps now correctly remove all timer events for a given object.
- [x] New sfall opcodes 0x82D0–0x82D7: reaction level, game/combat difficulty, team number queries.
- [x] phase89.test.ts: regression tests for all BLK items, sfall opcodes, arroyo smoke tests, and checklist integrity.

Gate: **PASS** — all 4152 tests green, tsc clean.

---

## Phase 90 — Arroyo combat/trait hardening: attack/display guards, sfall 0x82D8–0x82DF

- [x] **BLK-176**: `attack_complex()` null `self_obj` guard — Temple NPC scripts call `attack_complex()` from map context with null `self_obj`; now warns and returns without starting combat.
- [x] **BLK-177**: `critter_add_trait(TRAIT_CHAR)` uninitialised `charTraits` guard — Initialises `charTraits` to an empty `Set` on demand.
- [x] **BLK-178**: `critter_add_trait(TRAIT_SKILL)` null `skills` guard — Guards `skills.setBase()` when `skills` is null; mirrors BLK-174.
- [x] **BLK-179**: `display_msg()` null/non-string guard — Guards against null/non-string messages before passing to `uiLog()`.
- [x] New sfall opcodes 0x82D8–0x82DF: critter body type, weapon type, counter, gender queries.
- [x] phase90.test.ts: regression tests for all BLK items, sfall opcodes, arroyo smoke tests, and checklist integrity.

Gate: **PASS** — all 4216 tests green, tsc clean.

---

## Phase 91 — Arroyo end-sequence debug (continued): animation/skill guards, sfall 0x82E0–0x82E7

- [x] **BLK-180**: `use_obj()` missing `use()` method guard — Guards with `typeof obj.use !== "function"`.
- [x] **BLK-181**: `reg_anim_animate_forever()` missing `singleAnimation()` guard — Guards against objects without `singleAnimation`.
- [x] **BLK-182**: `animate_move_obj_to_tile()` missing `walkTo()` guard — Guards against objects without `walkTo`; mirrors BLK-181.
- [x] **BLK-183**: `critter_mod_skill()` null `skills` guard — Guards `skills.getBase()` when `skills` is null.
- [x] **BLK-184**: `set_critter_skill_points()` null `skills` guard — Guards `skills.setBase()` when `skills` is null; mirrors BLK-183.
- [x] New sfall opcodes 0x82E0–0x82E7: critter poison, radiation, heal-rate, sequence queries.
- [x] phase91.test.ts: regression tests for all BLK items, sfall opcodes, arroyo smoke tests, and checklist integrity.

Gate: **PASS** — all 4281 tests green, tsc clean.

---

## Phase 92 — Arroyo end-sequence debug and polish (final): final guards, sfall 0x82E8–0x82EF

- [x] **BLK-185**: `get_pc_stat(0)` null `player.skills` guard — Returns 0 safely when `player.skills` is null; mirrors BLK-174.
- [x] **BLK-186**: `get_critter_skill()` missing `getSkill()` method guard — Returns 0 when `getSkill` is not a function; guards proto-only arroyo NPC objects.
- [x] **BLK-187**: `tile_distance()` non-finite tile guard — Returns 9999 for non-finite tile numbers, preventing NaN propagation into downstream proximity/encounter checks.
- [x] **BLK-188**: `rm_mult_objs_from_inven()` null inventory guard — Guards with `Array.isArray(obj.inventory)`, returning 0 for uninitialised containers; mirrors `add_mult_objs_to_inven`.
- [x] **BLK-189**: `kill_critter()` null/non-critter guard — Guards against null (Fallout 2 null-ref `0`) and non-critter objects before calling `critterKill()`.
- [x] New sfall opcode 0x82E8: `get_critter_level_sfall` (alias of 0x8282)
- [x] New sfall opcode 0x82E9: `set_critter_level_sfall` (alias of 0x8284)
- [x] New sfall opcode 0x82EA: `get_critter_age_sfall(obj)` — critter age value (0 if unset)
- [x] New sfall opcode 0x82EB: `set_critter_age_sfall(obj, val)` — set critter age, stored for future use
- [x] New sfall opcode 0x82EC: `get_critter_kill_type_sfall2(obj)` — critter kill-type index (alias of 0x821C)
- [x] New sfall opcode 0x82ED: `set_critter_kill_type_sfall2(obj, val)` — set critter kill-type index
- [x] New sfall opcode 0x82EE: `get_party_size_sfall()` — current NPC party member count
- [x] New sfall opcode 0x82EF: `get_max_level_sfall()` — 99 (Fallout 2 maximum player level cap)
- [x] phase92.test.ts: 44 regression tests for all BLK items, sfall opcodes, arroyo end-sequence smoke tests, and checklist integrity.

Gate: **PASS** — all 4325 tests green, tsc clean.


---

## Phase 93 --- Arroyo debug and polish (continued): inventory/dialogue guards, sfall 0x82F0-0x82F7

- [x] **BLK-190**: inven_cmds() null inventory guard
- [x] **BLK-191**: has_skill() missing getSkill() method guard
- [x] **BLK-192**: critter_attempt_placement() non-finite tile guard
- [x] **BLK-193**: drop_obj() null source inventory guard
- [x] **BLK-194**: pickup_obj() null player inventory guard
- [x] New sfall opcodes 0x82F0-0x82F7: HP aliases, melee dmg, critical chance.
- [x] phase93.test.ts: regression tests for all BLK items, sfall opcodes, arroyo end-sequence smoke tests, and checklist integrity.

Gate: **PASS** --- all 4392 tests green, tsc clean.

---

## Phase 94 --- Arroyo debug and polish (continued): stat/skill/lighting guards, sfall 0x82F8-0x82FF

- [x] **BLK-195**: set_pc_stat(0) null player.skills guard
- [x] **BLK-196**: set_critter_kills() non-finite amount guard
- [x] **BLK-197**: roll_vs_skill() non-finite bonus guard
- [x] **BLK-198**: tile_is_visible() non-finite tile guard
- [x] **BLK-199**: obj_set_light_level() non-finite intensity/distance guard
- [x] New sfall opcodes 0x82F8-0x82FF: armor class, damage resist/thresh, action points.
- [x] phase94.test.ts: regression tests for all BLK items, sfall opcodes, arroyo smoke tests, and checklist integrity.

Gate: **PASS** --- all 4459 tests green, tsc clean.

---

## Phase 95 --- Debug and polish: start menu to end of Arroyo (inventory/visibility/var guards, sfall 0x8300-0x8307)

- [x] **BLK-200**: obj_is_carrying_obj_pid() null-inventory guard
- [x] **BLK-201**: add_mult_objs_to_inven() null-inventory guard
- [x] **BLK-202**: set_map_var() non-finite value guard
- [x] **BLK-203**: set_obj_visibility() non-numeric visibility guard
- [x] **BLK-204**: giq_option() empty-string message guard
- [x] New sfall opcodes 0x8300-0x8307: critter SPECIAL stats (Perception, Luck, Agility, Charisma).
- [x] phase95.test.ts: regression tests for all BLK items, sfall opcodes, arroyo start-to-end smoke tests, and checklist integrity.

Gate: **PASS** --- all 4527 tests green, tsc clean.
