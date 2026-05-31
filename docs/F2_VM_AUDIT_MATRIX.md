# Fallout 2 Script VM Audit Matrix (Phase 1)

This matrix tracks procedure/opcode fidelity for Fallout 2 critical-path certification.

## Method

- Source-of-truth inventory: `src/scriptingChecklist.ts`
- Runtime gap telemetry:
  - `recordStubHit` / `drainStubHits`
  - VM unsupported operation telemetry in `src/vm.ts`
- Coverage mapping:
  - targeted regression suites (`phase*.test.ts`, campaign/worldmap/save/combat tests)

Legend:
- Critical-path relevance: `YES` / `PARTIAL` / `NO`
- Test coverage: `YES` (named test) / `PARTIAL` (indirect) / `NO`
- Priority:
  - `P0` campaign blocker
  - `P1` high gameplay fidelity impact
  - `P2` medium/low impact follow-up

| Procedure/Opcode | Kind | Current status | Main-quest scripts? | Common town scripts? | Current test coverage | Priority | Notes / next action |
|---|---|---|---|---|---|---|---|
| `proto_data` | procedure | partial | YES | YES | PARTIAL (`phase21.test.ts`, `phase22.test.ts`) | P0 | Continue filling remaining members used by quest scripts; add member-specific regressions per fix. |
| `use_obj` | procedure | implemented | YES | YES | YES (`phase11.test.ts`, `phase24.test.ts`) | P0 | Keep as baseline critical interaction path. |
| `use_obj_on_obj` | procedure | implemented | YES | YES | YES (`phase11.test.ts`) | P0 | Maintain stable item-on-target flow for key quest locks/triggers. |
| `use_obj_on_p_proc` | procedure | implemented | YES | YES | YES (`phase11.test.ts`) | P0 | Verify against town-specific item scripts during region certification. |
| `tile_is_visible` | procedure | partial | PARTIAL | YES | PARTIAL (`phase11.test.ts`, `phase22.test.ts`) | P1 | Current behavior is always-visible; replace with real visibility/fog query when map visibility state is available. |
| `reg_anim_animate` | procedure | partial | PARTIAL | YES | YES (`phase14.test.ts`) | P1 | Silent/log-only for many animation codes; upgrade for quest-visible scripted animation beats. |
| `reg_anim_func` | procedure | partial | PARTIAL | YES | YES (`phase14.test.ts`) | P1 | Callback semantics remain simplified; tighten ANIM_BEGIN/COMPLETE sequencing behavior. |
| `anim` | procedure | partial | YES | YES | YES (`phase19.test.ts`, `phase24.test.ts`) | P1 | Standard/mid/extended ranges largely no-op/logged; prioritize codes used by critical-path quest scripts. |
| `metarule_46` | metarule | partial | YES | YES | PARTIAL (`phase11.test.ts`) | P1 | Returns `currentMapID`; validate parity for town-ID semantics across multi-map hubs. |
| `metarule3_103` | metarule | implemented | YES | YES | YES (`phase22.test.ts`) | P1 | Implemented via active combat roster membership + global fallback. |
| `metarule3_104` | metarule | partial | PARTIAL | YES | YES (`phase22.test.ts`) | P1 | LOS currently always-true; replace with line-of-sight query once available in VM context. |
| `metarule3_102` | metarule | partial | PARTIAL | YES | YES (`phase22.test.ts`) | P2 | Walkability currently always-true; integrate map/path blocking query. |
| `get_game_mode` (0x817E) | opcode | partial | NO | PARTIAL | YES (`phase20.test.ts`) | P2 | Returns 0; implement mode bitmask register only if content requires it. |
| `set_global_script_repeat` (0x817F) | opcode | partial | NO | PARTIAL | YES (`phase20.test.ts`) | P2 | No-op currently; implement global script ticker when evidence shows progression dependency. |
| `get_script_return_value` (0x818F) | opcode | partial | NO | NO | YES (`phase25.test.ts`) | P2 | Hook-script support not present; keep monitored but lower campaign risk. |

## Current top implementation queue

1. `proto_data` member completion for remaining quest-relevant fields.
2. `anim`/`reg_anim_*` fidelity in branches that visibly alter progression scripts.
3. `metarule_46` parity validation across town/map transitions.
4. Visibility/LOS/walkability (`tile_is_visible`, `metarule3_104`, `metarule3_102`) once map-state APIs are wired into scripting.

## Phase 51 additions

| Procedure/Opcode | Kind | Current status | Priority | Notes |
|---|---|---|---|---|
| `player_stats_persistence` (BLK-035) | procedure | implemented | P0 | Player HP, SPECIAL, skills now saved in v14 schema; eliminates HP-reset-on-load bug. |
| `get_critter_stat_bonus` (0x81B6) | opcode | implemented | P2 | Returns derived minus base stat bonus. |
| `obj_art_name` (0x81B7) | opcode | implemented | P2 | Returns art path string of an object. |
| `get_item_type_int` (0x81B8) | opcode | implemented | P2 | Returns item subtype integer. |
| `set_pc_stat` (0x81B9) | opcode | implemented | P1 | Sets player stat by pcstat index (0–4). |
| `num_critters_in_radius` (0x81BA) | opcode | implemented | P1 | Count critters within hex radius; used by AI scripts. |
| `get_object_ai_num` (0x81BB) | opcode | implemented | P2 | Returns critter AI packet number. |
| `set_object_ai_num` (0x81BC) | opcode | implemented | P2 | Sets critter AI packet number. |
| `get_critter_hostile_to_dude` (0x81BD) | opcode | implemented | P2 | Returns hostile flag vs player. |

Next available sfall opcode: **0x81BE**

## Phase 67 additions

| Procedure/Opcode | Kind | Current status | Priority | Notes |
|---|---|---|---|---|
| `move_to_null_gmap` (BLK-073) | procedure | implemented | P0 | Guard against null gMap in elevation-change branch of move_to(); prevents crash during map transitions. |
| `rm_timer_event_null_obj` (BLK-074) | procedure | implemented | P1 | Guard against null obj in rm_timer_event(); prevents crash when scripts cancel timers on destroyed objects. |
| `player_injury_flags` (BLK-075) | procedure | implemented | P1 | Player crippled-limb and blindness flags persisted in save schema v19; prevents injury state reset on load. |
| `get_critter_radiation_sfall` (0x8238) | opcode | implemented | P2 | Alias of get_radiation(); returns critter radiation level. |
| `set_critter_radiation_sfall` (0x8239) | opcode | implemented | P2 | Set critter radiation to absolute value clamped [0,1000]. |
| `get_critter_poison_sfall` (0x823A) | opcode | implemented | P2 | Alias of get_poison(); returns critter poison level. |
| `set_critter_poison_sfall` (0x823B) | opcode | implemented | P2 | Set critter poison to absolute value clamped [0,1000]. |
| `critter_in_party_sfall` (0x823C) | opcode | implemented | P2 | Returns 1 if critter is in player party (gParty.members). |
| `get_critter_proto_flags_sfall` (0x823D) | opcode | partial | P3 | Returns obj.flags bitmask; partial — no full proto-flag table. |
| `set_critter_proto_flags_sfall` (0x823E) | opcode | partial | P3 | Stores flags on obj for subsequent reads; partial. |
| `get_party_count_sfall` (0x823F) | opcode | implemented | P2 | Returns current party size (gParty.members length). |

Next available sfall opcode: **0x8240**

## Phase 68 additions

| Procedure/Opcode | Kind | Current status | Priority | Notes |
|---|---|---|---|---|
| `objCanSeeObj null-gMap guard` (BLK-076) | procedure | implemented | P0 | Guard against null gMap + null positions in objCanSeeObj; returns true (unobstructed) when gMap is null. |
| `explosion null-gMap guard` (BLK-077) | procedure | implemented | P0 | Guard against null gMap in explosion(); emits warning and returns early. |
| `load_map null-gMap guard` (BLK-078) | procedure | implemented | P0 | Guard against null gMap in load_map(); emits warning and returns early. |
| `create_object_sid null-gMap guard` (BLK-079) | procedure | implemented | P1 | Guard against null gMap in create_object_sid(); emits warning and returns null. |
| `save null gMap.name guard` (BLK-080) | procedure | implemented | P1 | save() log now uses gMap?.name ?? "(none)" to avoid TypeError when gMap is null. |
| `Obj.fromPID_ null pro guard` (BLK-081) | procedure | implemented | P0 | Guard against null pro in Obj.fromPID_(); obj.flags defaults to 0; pro-dependent init skipped. |
| `get_critter_damage_type_sfall` (0x8240) | opcode | implemented | P2 | Returns default melee damage type (0=normal … 6=explosion). |
| `set_critter_damage_type_sfall` (0x8241) | opcode | implemented | P2 | Sets default melee damage type (clamped 0–6). |
| `get_combat_free_move_sfall` (0x8242) | opcode | partial | P3 | Returns 0; no free-move tracking. |
| `set_combat_free_move_sfall` (0x8243) | opcode | partial | P3 | No-op; free-move not tracked. |
| `get_base_stat_sfall` (0x8244) | opcode | implemented | P1 | Returns base SPECIAL/derived stat for any critter. |
| `set_base_stat_sfall` (0x8245) | opcode | implemented | P1 | Sets base SPECIAL/derived stat for a critter via modifyBase(). |
| `get_game_difficulty_sfall` (0x8246) | opcode | partial | P3 | Always returns 1 (normal); no difficulty system. |
| `get_violence_level_sfall` (0x8247) | opcode | partial | P3 | Always returns 2 (maximum); no violence-level system. |

Next available sfall opcode: **0x8248**

## Phase 69 additions

| Procedure/Opcode | Kind | Current status | Priority | Notes |
|---|---|---|---|---|
| `float_msg safe performance guard` (BLK-082) | procedure | implemented | P1 | float_msg() now uses typeof-guarded performance.now() instead of window.performance.now(); fixes crash in Node.js. |
| `tile_is_visible null position guard` (BLK-083) | procedure | implemented | P1 | Guard against null player.position in tile_is_visible(); returns 1 (visible) when player.position is null. |
| `set_exit_grids null gameObjects guard` (BLK-084) | procedure | implemented | P1 | Guard against null gameObjects in set_exit_grids(); emits warning and returns early. |
| `obj_can_hear_obj null position guard` (BLK-085) | procedure | implemented | P1 | Guard against null positions in obj_can_hear_obj(); returns 0 when either position is null. |
| `get_map_limits_sfall` (0x8248) | opcode | implemented | P2 | Returns 200 for map width/height (Fallout 2 maps are always 200×200). |
| `obj_is_valid_sfall` (0x8249) | opcode | implemented | P2 | Returns 1 if argument is a valid game object, 0 otherwise. |
| `get_string_length_sfall` (0x824A) | opcode | implemented | P2 | Returns length of a string (0 for non-strings). |
| `get_char_code_sfall` (0x824B) | opcode | implemented | P2 | Returns char code at position in string (-1 for out-of-range). |
| `string_contains_sfall` (0x824C) | opcode | implemented | P2 | Returns 1 if haystack contains needle (case-sensitive). |
| `string_index_of_sfall` (0x824D) | opcode | implemented | P2 | Returns first index of needle in haystack, or -1. |
| `get_object_script_id_sfall` (0x824E) | opcode | implemented | P2 | Returns numeric script SID for object, or -1 when no script is attached. |
| `get_script_field_sfall` (0x824F) | opcode | partial | P3 | Returns 0 for all fields; engine-internal script context fields not exposed. |

Next available sfall opcode: **0x8250**

## Phase 87 additions

| Procedure/Opcode | Kind | Current status | Priority | Notes |
|---|---|---|---|---|
| `rm_mult_objs_from_inven non-positive count` (BLK-161) | procedure | implemented | P1 | Non-positive/non-finite count now treated as no-op returning 0; mirrors BLK-146 (add_mult_objs_to_inven). |
| `obj_carrying_pid_obj null inventory` (BLK-162) | procedure | implemented | P0 | Guard against undefined `obj.inventory` array before iteration; returns 0 safely. |
| `poison non-finite amount` (BLK-163) | procedure | implemented | P1 | Non-finite poison amounts rejected with warning; `modifyBase('Poison Level', …)` not called. |
| `radiation_add non-finite amount` (BLK-164) | procedure | implemented | P1 | Non-finite radiation amounts rejected with warning; mirrors BLK-163. |
| `radiation_dec non-finite amount` (BLK-165) | procedure | implemented | P1 | Non-finite radiation-dec amounts rejected with warning; completes the radiation-guard family. |
| `get_critter_active_weapon_sfall` (0x82C0) | opcode | implemented | P2 | Returns weapon in active hand slot (rightHand for NPCs, active-hand for player) or 0. |
| `get_critter_base_skill_sfall` (0x82C1) | opcode | implemented | P2 | Returns raw base skill allocation without SPECIAL modifier; delegates to `has_trait(TRAIT_SKILL, …)`. |
| `set_critter_base_skill_sfall` (0x82C2) | opcode | implemented | P2 | Sets base skill directly; delegates to `set_critter_skill_points()`, inheriting BLK-159 non-finite guard. |
| `get_critter_in_combat_sfall` (0x82C3) | opcode | implemented | P2 | Returns 1 if critter is in active combat roster, 0 otherwise; delegates to same check as metarule3(103). |
| `get_map_var_sfall` (0x82C4) | opcode | implemented | P2 | Reads map variable by index via sfall opcode path; delegates to `map_var()`. |
| `set_map_var_sfall` (0x82C5) | opcode | implemented | P2 | Sets map variable by index via sfall opcode path; delegates to `set_map_var()`. |
| `get_critter_attack_type_sfall` (0x82C6) | opcode | stub | P3 | Returns 0; no per-weapon attack-type table in browser build. |
| `get_critter_min_str_sfall` (0x82C7) | opcode | stub | P3 | Returns 0; no equipped-weapon proto lookup for minimum Strength. |

Next available sfall opcode: **0x82C8**

## Phase 96 additions

| Procedure/Opcode | Kind | Current status | Priority | Notes |
|---|---|---|---|---|
| `set_pc_base_stat non-finite value` (BLK-205) | procedure | implemented | P0 | Non-finite values (NaN/Infinity) now clamped to 0 before setBase(); mirrors BLK-133 (set_critter_stat). |
| `tile_num_in_direction non-finite dir/count` (BLK-206) | procedure | implemented | P1 | Non-finite dir or count now returns source tile unchanged; NaN%6===NaN broke hexInDirectionDistance. |
| `gsay_message empty-string guard` (BLK-207) | procedure | implemented | P1 | Guard now checks `msg === null || msg === ''`; mirrors BLK-204 (giq_option) and gsay_reply. |
| `critter_heal null getStat guard` (BLK-208) | procedure | implemented | P1 | Guard against partially-initialised critters lacking getStat() method; skips heal silently. |
| `random non-finite bounds guard` (BLK-209) | procedure | implemented | P1 | Non-finite min/max values each clamped to 0; getRandomInt(NaN,NaN) would return NaN and corrupt combat. |
| `get_critter_strength_sfall` (0x8308) | opcode | implemented | P2 | Returns Strength stat; used by carry-weight and weapon-strength-req scripts in Arroyo equipment distribution. |
| `set_critter_strength_sfall` (0x8309) | opcode | implemented | P2 | Sets Strength stat; clamped [1, 10]; non-finite coerced to 1. |
| `get_critter_endurance_sfall` (0x830A) | opcode | implemented | P2 | Returns Endurance stat; used by HP-max and radiation-resistance scripts in Arroyo/Temple. |
| `set_critter_endurance_sfall` (0x830B) | opcode | implemented | P2 | Sets Endurance stat; clamped [1, 10]; non-finite coerced to 1. |
| `get_critter_intelligence_sfall` (0x830C) | opcode | implemented | P1 | Returns Intelligence (INT) stat; used by giq_option IQ-gate checks and Arroyo Elder branching. |
| `set_critter_intelligence_sfall` (0x830D) | opcode | implemented | P1 | Sets Intelligence (INT) stat; clamped [1, 10]; non-finite coerced to 1. |
| `get_critter_sneak_state_sfall` (0x830E) | opcode | implemented | P2 | Returns 1 if SNK_MODE (pcFlags bit 3) is active; used by guard-AI detection in Arroyo village. |
| `set_critter_sneak_state_sfall` (0x830F) | opcode | implemented | P2 | Sets/clears SNK_MODE (pcFlags bit 3); enables sneak simulation for Arroyo stealth scripts. |

Next available sfall opcode: **0x8310**

## Phase 97 additions

| Procedure/Opcode | Kind | Current status | Priority | Notes |
|---|---|---|---|---|
| `isWithinPerception getStat/getSkill null guard` (BLK-210) | procedure | implemented | P1 | Guard against missing getStat/getSkill on Temple boss / early unplaced critters; returns false safely. |
| `rotation_to_tile non-finite tile guard` (BLK-211) | procedure | implemented | P1 | Non-finite tile coords from patrol math return -1 direction safely. |
| `wm_area_set_pos non-finite coordinates guard` (BLK-212) | procedure | implemented | P1 | Coordinate math yielding NaN in world map exit grids ignored cleanly with warning. |
| `mark_area_known non-finite area ID guard` (BLK-213) | procedure | implemented | P1 | NaN area ID calculation in quest flags dropped cleanly with warning to avoid corrupting mapAreas collection. |
| `critter_inven_obj undefined hand-slot guard` (BLK-214) | procedure | implemented | P1 | Null (not undefined) returned for unequipped slot objects to prevent == 0 comparison failures in VM. |
| `get_critter_orientation_sfall` (0x8310) | opcode | implemented | P2 | Returns critter facing direction modulo 6. |
| `set_critter_orientation_sfall` (0x8311) | opcode | implemented | P2 | Sets critter facing direction with wrapped modulo 6. |
| `get_critter_tile_num_sfall` (0x8312) | opcode | implemented | P2 | Returns critter tile number or -1. |
| `get_critter_elevation_sfall` (0x8313) | opcode | implemented | P2 | Returns elevation clamped [0, 2] or falls back to current map elevation. |
| `set_critter_base_ap_sfall` (0x8314) | opcode | implemented | P2 | Sets base Max AP clamped >= 0. |
| `get_critter_xp_for_level_sfall` (0x8315) | opcode | implemented | P2 | Returns exact level threshold XP according to Fallout 2 triangular progression formula. |
| `get_critter_base_hp_sfall` (0x8316) | opcode | implemented | P2 | Returns base Max HP. |
| `set_critter_base_hp_sfall` (0x8317) | opcode | implemented | P2 | Sets base Max HP clamped >= 1. |

Next available sfall opcode: **0x8318**

## Phase 98 additions

| Procedure/Opcode | Kind | Current status | Priority | Notes |
|---|---|---|---|---|
| `tile_num_in_direction out-of-bounds` (BLK-215) | procedure | implemented | P1 | Returns source tile when tile, direction or distance are non-finite (NaN/Infinity). |
| `critter_heal non-finite amount` (BLK-216) | procedure | implemented | P1 | Non-finite heal amount rejected with warning; HP not modified. |
| `item_caps_adjust non-finite adjustment` (BLK-217) | procedure | implemented | P1 | Non-finite adjustment amount rejected with warning; caps not modified. |
| `set_critter_stat invalid index` (BLK-218) | procedure | implemented | P1 | Warns and returns safely when stat index is out of bounds [0, 35]. |
| `move_to non-finite coordinates` (BLK-219) | procedure | implemented | P1 | Warns and performs no-op when destination tile is non-finite. |
| `get_critter_current_ap_sfall` (0x8318) | opcode | implemented | P2 | Returns current AP. |
| `set_critter_current_ap_sfall` (0x8319) | opcode | implemented | P2 | Sets current AP clamped to base Max AP. |
| `get_critter_extra_stat_sfall` (0x831A) | opcode | implemented | P2 | Returns derived stat modifier by stat ID mapping. |
| `set_critter_extra_stat_sfall` (0x831B) | opcode | implemented | P2 | Sets derived stat modifier, writing to both extraStats and _extraStats for full parity. |
| `get_critter_base_ac_sfall` (0x831C) | opcode | implemented | P2 | Returns base Armor Class. |
| `set_critter_base_ac_sfall` (0x831D) | opcode | implemented | P2 | Sets base Armor Class clamped >= 0. |
| `get_critter_gender_sfall` (0x831E) | opcode | implemented | P2 | Returns critter gender (0=male, 1=female). |
| `set_critter_gender_sfall` (0x831F) | opcode | implemented | P2 | Sets critter gender (0 or 1). |

Next available sfall opcode: **0x8320**

## Phase 109 additions

| Procedure/Opcode | Kind | Current status | Priority | Notes |
|---|---|---|---|---|
| `combatEvent onAttack` | procedure | implemented | P1 | Fires `combat_p_proc(COMBAT_SUBTYPE_ATTACK)` on attacker before hit roll. |
| `combatEvent onDeath` | procedure | implemented | P1 | Fires `combat_p_proc(COMBAT_SUBTYPE_DEATH)` on target in `perish()`. |
| `isWithinPerception critterFlags` | procedure | implemented | P1 | Bit 2 of target `critterFlags` halves perception range (integer-truncated). |
| `get_combat_target` (0x81CB) | opcode | implemented | P2 | Returns critter's current combat target from AI state. |
| `set_combat_target` (0x81CC) | opcode | implemented | P2 | Sets combat target and starts combat if needed. |
| `get_critter_attack_mode_sfall` (0x81E2) | opcode | implemented | P2 | Maps proto attackMode nibbles to 0=unarmed/1=melee/2=ranged. |
| `set_critter_attack_mode_sfall` (0x81E3) | opcode | implemented | P2 | Per-critter attack-mode override. |
| `get_inven_ap_cost_sfall` (0x8225) | opcode | implemented | P2 | Returns inventory AP cost (default 4). |
| `get_attack_type_sfall` (0x8256) | opcode | implemented | P2 | Returns current attack type from combat state. |
| `get_critter_attack_type_sfall` (0x82C6) | opcode | implemented | P2 | Returns per-critter attack type (primary/secondary). |
| `get_critter_min_str_sfall` (0x82C7) | opcode | implemented | P2 | Returns minimum strength requirement for critter's weapon. |
| `get_num_critters_on_tile_sfall` (0x82BE) | opcode | implemented | P2 | Counts critters on a packed tile number. |
| `get_critter_combat_data_sfall` (0x82BF) | opcode | implemented | P2 | Returns combat bitmask (inCombat/hostile/fleeing/currentTurn). |
| `get_combat_free_move_sfall` (0x8242) | opcode | implemented | P2 | Reads combatFreeMove from script instance. |
| `set_combat_free_move_sfall` (0x8243) | opcode | implemented | P2 | Sets combatFreeMove on script instance. |
| `obj_is_disabled_sfall` (0x81D4) | opcode | implemented | P2 | Checks critter AI disable flag. |
| `get_last_pers_obj` (0x81D3) | opcode | implemented | P2 | Returns last persistent-combat initiator from globalState. |
| `tile_add_blocking` (0x8140) | opcode | implemented | P2 | Adds tile to `globalState.blockedTiles` Set; checked in `hexLinecast`. |
| `tile_remove_blocking` (0x8141) | opcode | implemented | P2 | Removes tile from `globalState.blockedTiles` Set. |
| `get_drop_amount` (0x81D8) | opcode | implemented | P2 | Reads from `globalState.dropAmounts` Map keyed by UID. |
| `set_drop_amount` (0x81D9) | opcode | implemented | P2 | Writes to `globalState.dropAmounts` Map. |
| `set_critter_burst_disable` (0x81DF) | opcode | implemented | P2 | Stores `burstDisabled` flag on critter. |
| `force_encounter` (0x81D1) | opcode | implemented | P2 | Looks up encounter table by ID/name, calls `execEncounter`. |
| `force_encounter_with_flags` (0x81D2) | opcode | implemented | P2 | Same + bit 0 starts combat immediately. |
| `set_weapon_knockback` (0x81B4) | opcode | implemented | P2 | Stores clamped `knockbackDist`/`knockbackChance` on weapon. |
| `remove_weapon_knockback` (0x81B5) | opcode | implemented | P2 | Deletes knockback properties from weapon. |
| `Combat.attack knockback` | procedure | implemented | P1 | Applies hex push on hit with null-position guard and grid-bounds check. |
| `hexLinecast blockedTiles` | procedure | implemented | P1 | Checks `globalState.blockedTiles` before object query; returns proper Obj sentinel. |
