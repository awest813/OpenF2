# OpenF2 Roadmap

The plan for delivering the **complete Fallout 2 experience in the browser** — and, once that is solid, an optional layer of quality-of-life improvements.

---

## Vision

**Play all of Fallout 2 in a modern browser, faithful to the original, with no native install.**

OpenF2 is structured around three ordered goals:

1. **Complete Fallout 2 fidelity** — every location, quest, NPC, scripted event, and ending should work exactly as they do in the original game. This is the non-negotiable north star.
2. **Browser-native portability** — the engine runs on WebGL + HTML5 Audio. You bring a legal copy of the game data; the engine does the rest. Optional native wrappers are a stretch goal.
3. **Optional QoL upgrades** — higher resolutions, UI improvements, extended sfall-style scripting hooks, and other modern conveniences are welcome *after* vanilla fidelity is complete, and always as toggleable additions that never alter core gameplay.

Fallout 1 compatibility is maintained as a secondary goal, so the engine can serve both classic titles.

---

## Current Status

| Item | Detail |
|------|--------|
| **Active phase** | Phase 4 — Fidelity, Modding, and Tooling |
| **Completed phases** | 0 · 1 · 2 · 3 |
| **Critical path** | Scripting VM completeness (Fallout 2 procedure stubs, sfall extended opcodes) |

### What works today

- Map loading, traversal, and actor movement
- Full SPECIAL stats + derived stats pipeline
- Skills (18 skills, checks, progression)
- Traits and perks with prerequisite enforcement
- Combat damage formula (DT/DR, ammo, criticals, AP rules)
- Inventory and equipment management
- Character leveling and XP flow
- Quest tracking, reputation, and karma
- Versioned save/load with schema migration
- Fallout 1 compatibility layer (`src/compat/fallout1.ts`)
- DAT override stacking and mod manifests (`src/mods.ts`)
- In-browser debug overlay (DebugOverlayPanel, toggled with F3 / backtick)
- All gameplay panels (dialogue, barter, loot, inventory, world map overlay, elevator, called-shot) rendering via the `ui2` WebGL path
- Animation first-frame timing corrected (`singleAnimation`/`staticAnimation`)
- Scripting opcodes: `reg_anim_obj_move_to_tile` (0x8110), `get_year` (0x811b), `obj_get_rot` (0x8155), `set_obj_rot` (0x8156)
- In-browser authoring tools: MapViewerPanel (F5), ScriptDebuggerPanel (F6), PrototypeInspectorPanel (F7)
- Performance: `SpriteBatch` draw-call batching (`src/renderBatch.ts`), `AssetCache` LRU streaming cache (`src/assetStore.ts`)
- **Scripting VM milestone:** `obj_art_fid`, `art_anim` procedures implemented; sfall global variable store (`src/sfallGlobals.ts`); sfall v4 version detection via `metarule(56, 0)`; `get_sfall_global` (0x8157) / `set_sfall_global` (0x8158) opcodes; `critter_add_trait` OBJECT_CUR_ROT and OBJECT_VISIBILITY side-effects
- **Scripting VM continued:** `get_poison` (0x8123) and `get_radiation` (0x8159) critter status getters implemented; integer-indexed sfall globals (`getSfallGlobalInt` / `setSfallGlobalInt`, opcodes 0x815A–0x815B); `get_day_of_week` game-clock opcode (0x815C)
- **VM opcode completeness:** `op_bwxor` (0x8042) and `op_bwnot` (0x8043) added to `vm_opcodes.ts` completing the bitwise-operation set; regression tests added in `vm.test.ts`
- **Scripting procedures:** `play_sfx` now delegates to `audioEngine.playSfx`; `reg_anim_obj_move_to_tile` and `animate_stand_obj` de-stubbed with real `walkTo`/frame-reset implementations
- **sfall opcodes:** `get_game_time_in_seconds` (0x815D) and `in_world_map` (0x815E) added to `vm_bridge.ts`
- **De-stubbed procedures:** `set_light_level` (ambient light clamped 0–65536), `obj_set_light_level` (per-object intensity/radius), `game_ui_disable`/`game_ui_enable` (UI state toggling via `globalState.gameUIDisabled`)
- **sfall opcodes continued:** `get_pc_base_stat` (0x815F), `set_pc_base_stat` (0x8160), `set_critter_current_ap` (0x8161), `get_npc_level` (0x8162) added to `vm_bridge.ts` + `scripting.ts`
- **sfall opcodes — critter/PC helpers:** `get_critter_current_ap` (0x8163), `get_critter_max_hp` (0x8164), `get_pc_level` (0x8165); `critter_attempt_placement` de-stubbed
- **VM debug fields:** `stepCount` + `currentProcedureName` on `ScriptVM`; `ScriptDebuggerPanel` surfaces step count and active procedure name
- **Performance instrumentation (Safe Impact Roadmap — step 1):** `AssetCache` extended with decode-latency telemetry (`recordDecodeLatency`, `avgDecodeLatencyMs`) and eviction-reason tracking (`lastEvictionReason`); `SpriteBatch` extended with frame-time telemetry (`frameTimeMs` in `BatchStats`); `ScriptVM.call()` instruments top-level call duration (`lastCallTimeMs`, `totalCallTimeMs`); `GameMap.recalcPath()` wrapped with `PathfindingTelemetry` counters (`totalCalls`, `totalTimeMs`, `worstCaseTimeMs`, `lastSolveTimeMs`)
- **Performance safeguards (Safe Impact Roadmap — step 2):** `ScriptVM.call()` now tracks slow-call telemetry (`slowCallCount`, `lastSlowCallTimeMs`) and emits warn-level logs when top-level procedure runtime exceeds `Config.engine.vmSlowCallWarnThresholdMs`
- **sfall opcodes — any-critter stat helpers:** `get_critter_base_stat` (0x8166), `set_critter_base_stat` (0x8167), `in_combat` (0x8168) added to `vm_bridge.ts` + `scripting.ts`; regression tests added in `vm.test.ts`
- **critter_inven_obj WORN fix:** `critter_inven_obj` with `INVEN_TYPE_WORN` (0) now returns `equippedArmor` instead of falling through to stub
- **Save schema v5 — scriptGlobalVars persistence:** `SAVE_VERSION` bumped to 5; `scriptGlobalVars: Record<number,number>` added to save schema; Fallout 2 script global variables (GVAR_*) now snapshot on save and are restored on load so quest flags, faction states, and world-event flags survive across sessions; v4→v5 migration adds empty dict for old saves; `Scripting.setGlobalVars()` export added
- **proto_data de-stubbed (partial):** `proto_data(pid, data_member)` now handles data_member 0 (PID), 1 (textID), 2 (FID), 3 (lightRadius), 4 (lightIntensity), 5 (flags), 8 (item subtype), 9 (item weight), 10 (item cost), 11 (item size), 14–16 (weapon min/max/dmgType), 21–22 (weapon AP costs), 25–27 (caliber/ammoPID/maxAmmo), 6 (critter actionFlags); gracefully returns 0 when proMap is unavailable; checklist updated to 'partial'
- **De-stubbed procedures:** `gfade_in`, `gfade_out`, and `play_gmovie` now log silently instead of emitting console stub warnings (no FMV pipeline in browser build); checklist entries added as 'partial'
- **sfall opcodes 0x8170–0x8174:** `get_critter_kills` (0x8170), `set_critter_kills` (0x8171), `get_critter_body_type` (0x8172), `floor2` (0x8173), `obj_count_by_pid` (0x8174) added to `vm_bridge.ts` + `scripting.ts`; `globalState.critterKillCounts` added for session-scoped kill tracking
- **Phase 17 — Scripting completeness & save reliability:**
  - **Extended `statMap`:** `get_critter_stat` / `set_critter_stat` now cover all 34 stat constants (0–33, 35) including AC (9), Max AP (8), carry weight (12), sequence (13), healing rate (14), critical chance (15), better criticals (16), all DT/DR types (17–32), and age (33); no more stub emissions for standard stat reads
  - **`gsay_end` de-stubbed:** the Script method no longer emits a stub warning; the VM-level opcode handler (0x811D) already halts the VM correctly and was unaffected
  - **`end_dialogue` implemented:** now calls `dialogueExit()` to properly close dialogue and resume the VM; previously stubbed and left the dialogue UI hanging
  - **`anim` stub noise eliminated:** rotation (1000) and frame-set (1010) cases now execute silently; only genuinely unknown animation codes record a stub hit
  - **`set_exit_grids`, `tile_contains_pid_obj` de-stubbed:** implementation was already complete; stub call removed so console is no longer flooded during map entry
  - **`wm_area_set_pos`, `mark_area_known` (MARK_TYPE_MAP):** changed from stub to log; neither has browser-side state to update and the stub warning was noise
  - **`has_trait` / `critter_add_trait` OBJECT_CUR_WEIGHT (669):** now reads/writes the critter's `Carry` base stat; checklist entry promoted from `stub` to `implemented`
  - **Save schema v6:** `gameTickTime` (game clock in ticks) and `critterKillCounts` (per-type kill counts) added to `SaveGame`; both now survive save/load so the calendar, quest timers, and lifetime kill-count checks are correct after loading; v5→v6 migration initialises both to safe defaults; `snapshotSaveData` and `hydrateStateFromSave` updated accordingly

### Remaining gaps (critical path to 1.0)

- **Scripting VM:** many Fallout 2 procedures remain stubs — closing these is the single biggest unlock for game completability
- **Dialogue + barter edge cases:** some conversation flows and barter interactions need further fidelity work
- **Authoring tools:** full map editor and script step-debugger are future work

---

## Phase History

### ✅ Phase 0 — Stabilize Core Architecture

*Goal: Make core systems reliable enough for rapid feature development.*

- [x] Centralized engine lifecycle and state boundaries
- [x] Hardened event/message plumbing between subsystems
- [x] Typed ECS coverage for actors, items, and scripts
- [x] Versioned save schema with migration strategy
- [x] Regression tests for scripting and combat primitives

---

### ✅ Phase 1 — Playable Core RPG Loop

*Goal: Deliver a stable "start-to-first-hub" experience with Fallout 2 content.*

- [x] Complete SPECIAL + derived stats pipeline
- [x] All 18 skills with checks and progression hooks
- [x] Traits and perks with prerequisite enforcement
- [x] Combat correctness: armor, ammo, ranges, AP rules
- [x] Inventory/equipment behavior and constraints
- [x] Reliable leveling flow and character screen interactions

---

### ✅ Phase 2 — Full Fallout 2 Completion (Foundation)

*Goal: Lay the foundation for a completable Fallout 2 playthrough.*

- [x] World map correctness and travel balancing
- [x] Broader opcode/procedure coverage in scripting runtime
- [x] Quest tracking and reputation/karma consistency
- [x] Audio completeness baseline: effects, music logic, format handling
- [x] Ending/intro/cinematic pipeline baseline
- [x] Full UI migration to bitmap-faithful rendering *(complete — Phase 4)*

---

### ✅ Phase 3 — Fallout 1 Compatibility

*Goal: Support running Fallout 1 data and game flow.*

- [x] DAT1/MAP/PRO format compatibility layer (`src/compat/fallout1.ts`)
- [x] Fallout 1 world-map grid configuration (`worldGridConfig`)
- [x] F1 encounter rate table (`encounterRateForFrequency`)
- [x] Script/procedure compatibility table
- [x] F1 intro/ending cinematic sequence factories (`buildF1CinematicSequence`)

---

### 🔄 Phase 4 — Fidelity, Modding, and Tooling *(active)*

*Goal: Improve correctness, performance, and the contributor ecosystem until Fallout 2 is completable end-to-end.*

The scripting VM is the critical path here. Every stubbed procedure that gets de-stubbed is a step closer to a fully playable game.

- [x] DAT override stacking + structured mod manifests (`src/mods.ts`, `ModRegistry`)
- [x] Pathfinding and line-of-sight correctness (`hexLine` cube-lerp, `hexesInRadius` ring algorithm)
- [x] World map target placement centering and scroll-bounds correction
- [x] In-browser debug overlay (DebugOverlayPanel — HP/AP/entity count/frame counter)
- [x] **UI migration:** move remaining DOM panels to `ui2` WebGL rendering (dialogue, barter, loot, inventory, world map overlay, elevator, called shot)
- [x] Rendering edge-case parity and animation timing polish (`singleAnimation`/`staticAnimation` first-frame timing fixed)
- [x] **Scripting coverage:** `reg_anim_obj_move_to_tile` (0x8110), `get_year` (0x811b), `obj_get_rot` (0x8155), `set_obj_rot` (0x8156) added to `vm_bridge.ts` + `scripting.ts`
- [x] **Authoring tools:** MapViewerPanel (F5), ScriptDebuggerPanel (F6), PrototypeInspectorPanel (F7) added to `ui2/`
- [x] **Performance:** `SpriteBatch` draw-call batching (`src/renderBatch.ts`), `AssetCache` LRU streaming cache (`src/assetStore.ts`)
- [x] **Scripting VM milestone:** `obj_art_fid`, `art_anim` procedures; sfall global store (`src/sfallGlobals.ts`); sfall v4 version via `metarule(56, 0)`; `get_sfall_global` (0x8157) / `set_sfall_global` (0x8158) opcodes; `critter_add_trait` OBJECT_CUR_ROT / OBJECT_VISIBILITY
- [x] **Scripting VM continued:** `get_poison` (0x8123) and `get_radiation` (0x8159) critter status getters; integer-indexed sfall globals (`getSfallGlobalInt`/`setSfallGlobalInt`, opcodes 0x815A–0x815B, `MAX_SFALL_INT_GLOBALS = 4096`); `get_day_of_week` game-clock opcode (0x815C)
- [x] **VM opcode completeness:** `op_bwxor` (0x8042) and `op_bwnot` (0x8043) added to `vm_opcodes.ts`; full bitwise-operation suite covered with regression tests
- [x] **Scripting procedures:** `play_sfx` delegates to `audioEngine.playSfx`; `reg_anim_obj_move_to_tile` and `animate_stand_obj` de-stubbed (real movement / frame-reset)
- [x] **sfall opcodes:** `get_game_time_in_seconds` (0x815D) and `in_world_map` (0x815E) added to `vm_bridge.ts`
- [x] **De-stubbed procedures:** `set_light_level` (ambient light clamped 0–65536), `obj_set_light_level` (per-object intensity/radius), `game_ui_disable`/`game_ui_enable` (UI state toggling via `globalState.gameUIDisabled`)
- [x] **sfall opcodes continued:** `get_pc_base_stat` (0x815F), `set_pc_base_stat` (0x8160), `set_critter_current_ap` (0x8161), `get_npc_level` (0x8162) added to `vm_bridge.ts` + `scripting.ts`
- [x] **sfall opcodes — critter/PC helpers:** `get_critter_current_ap` (0x8163), `get_critter_max_hp` (0x8164), `get_pc_level` (0x8165) added; `critter_attempt_placement` de-stubbed (delegates to `move_to` without spurious warning)
- [x] **VM debug fields:** `stepCount` (incremented each `step()`) and `currentProcedureName` (set/restored in `call()`) added to `ScriptVM`; `ScriptDebuggerPanel` now surfaces step count and active procedure name
- [x] **Performance instrumentation:** `AssetCache` extended with `recordDecodeLatency`/`avgDecodeLatencyMs` and `lastEvictionReason`; `SpriteBatch.BatchStats` gains `frameTimeMs`; `ScriptVM.call()` tracks `lastCallTimeMs`/`totalCallTimeMs`; `GameMap` exposes `pathfindingTelemetry` (`PathfindingTelemetry`) updated on every `recalcPath` call
- [x] **Save schema v5 — scriptGlobalVars persistence:** `SAVE_VERSION` bumped to 5; `scriptGlobalVars` field added to `SaveGame`; all Fallout 2 script global variables (GVAR_*) now survive save/load; v4→v5 migration adds empty dict for legacy saves; `Scripting.setGlobalVars()` export added
- [x] **proto_data partial implementation:** `proto_data(pid, data_member)` now handles data_member constants 0–11, 14–16, 21–22, 25–27, 6 (PID, textID, FID, lightRadius/Intensity, flags, item subtype/weight/cost/size, weapon stats, critter action flags); gracefully returns 0 when proMap is unavailable; checklist updated to 'partial'
- [x] **De-stubbed — gfade/movie:** `gfade_in`, `gfade_out`, and `play_gmovie` now log silently (no FMV pipeline yet) instead of emitting console stub warnings; checklist entries added as 'partial'
- [x] **sfall opcodes 0x8170–0x8174:** `get_critter_kills` (0x8170), `set_critter_kills` (0x8171), `get_critter_body_type` (0x8172), `floor2` (0x8173), `obj_count_by_pid` (0x8174) added; `globalState.critterKillCounts` added for session-scoped kill tracking
- [x] **Phase 17 — Scripting completeness & save reliability:** extended `statMap` (stats 8–33 including AC/AP/carry/DT/DR); `gsay_end` and `end_dialogue` de-stubbed; `anim` stub noise eliminated for handled cases; `set_exit_grids`/`tile_contains_pid_obj`/`wm_area_set_pos`/`mark_area_known(MARK_TYPE_MAP)` de-stubbed; `has_trait`/`critter_add_trait` OBJECT_CUR_WEIGHT (669) implemented; save schema v6 adds `gameTickTime` and `critterKillCounts` persistence
- [x] **Phase 19 — Scripting fidelity: ammo/weapon state, anim de-stub, proto_data extensions:**
  - **`anim()` de-stub:** codes 0 (ANIM_stand → frame reset) and 1–99 (standard ANIM_* constants) are now handled silently via `log()` instead of calling `stub()` — eliminates the largest source of console noise during map entry
  - **`get_pc_stat(5)` fixed:** PCSTAT_max_pc_stat now returns 5 (the count of valid PC stat indices 0–4) instead of emitting a stub warning
  - **`inven_cmds` navigation commands:** INVEN_CMD_FIRST (0), INVEN_CMD_LAST (1), INVEN_CMD_PREV (2), and INVEN_CMD_NEXT (3) implemented for inventory cursor traversal; unknown commands still record a stub hit
  - **`proto_data` extended:** data_member 12 (WEAPON_DATA_ANIMATION_CODE → animCode), 17 (attack_mode_1 low nibble), 18 (attack_mode_2 high nibble), 19 (projPID), 20 (minST), 32 (ARMOR_DATA_AC), 33 (ARMOR_DATA_DR_NORMAL), 34 (WEAPON_DATA_BURST_ROUNDS → rounds) — all return 0 gracefully when proMap is unavailable
  - **sfall opcodes 0x8178–0x817C:** `get_weapon_ammo_pid` (0x8178), `set_weapon_ammo_pid` (0x8179), `get_weapon_ammo_count` (0x817A), `set_weapon_ammo_count` (0x817B), `get_mouse_tile_num` (0x817C) added to `vm_bridge.ts` + `scripting.ts`; ammo state stored in `weapon.extra.ammoType`/`ammoLoaded` (persisted via `SerializedObj.extra`)
  - **Checklist updated:** 10 new entries added (7 implemented, 2 partial, 1 partial)
  - **37 new regression tests** in `phase19.test.ts`
- [x] **Phase 20 — Scripting fidelity: metarule completeness, has_trait extensions, sfall 0x817D–0x817F:**
  - **`metarule` de-stubs:** IDs 30 (CHECK_WEAPON_LOADED → `extra.ammoLoaded > 0`), 35 (COMBAT_DIFFICULTY → 1 normal), 44 (WHO_ON_DRUGS → 0), 47 (MAP_KNOWN → mirrors case 17 area-discovery logic), 55 (GAME_DIFFICULTY → 1 normal) — eliminates common stub noise in NPC and combat scripts
  - **`metarule3` de-stubs:** ID 101 (METARULE3_RAND → `getRandomInt(min, max)`) and ID 107 (METARULE3_TILE_VISIBLE → 1 partial) — bounded random used pervasively in encounter scripts
  - **`has_trait` TRAIT_OBJECT extended:** cases 1 (INVEN_TYPE_RIGHT_HAND), 2 (INVEN_TYPE_LEFT_HAND), 3 (INVEN_TYPE_INV_COUNT → inventory length), 667 (OBJECT_IS_FLAT → extra.isFlat), 668 (OBJECT_NO_BLOCK → extra.noBlock)
  - **`critter_add_trait` TRAIT_OBJECT extended:** cases 667 (OBJECT_IS_FLAT) and 668 (OBJECT_NO_BLOCK) write to `obj.extra`, initialising it if absent; full has_trait round-trip verified
  - **sfall opcodes 0x817D–0x817F:** `get_critter_name` (0x817D → obj.name string), `get_game_mode` (0x817E → 0 partial), `set_global_script_repeat` (0x817F → no-op partial)
  - **Checklist updated:** 13 new entries added (5 implemented, 8 partial)
  - **51 new regression tests** in `phase20.test.ts`
- [x] **Phase 21 — Scripting fidelity: inventory count de-stub, proto_data armor DR, sfall 0x8180–0x8182:**
  - **`critter_inven_obj` INVEN_TYPE_INV_COUNT (-2) de-stubbed:** now returns `obj.inventory.length` instead of emitting a warning and returning 0 — eliminates incorrect inventory-count results in NPC barter and dialogue scripts
  - **`proto_data` armor DR fields extended:** cases 34 (DR Laser — disambiguated from weapon burst_rounds by subType), 35 (DR Fire), 36 (DR Plasma), 37 (DR Electrical), 38 (DR EMP), 39 (DR Explosive) — covers full armor damage-resistance matrix
  - **`obj_item_subtype` fallback de-stubbed:** returns 0 silently instead of emitting a stub hit when an item has no proto and no recognized string subtype — removes spurious console noise in item scripts
  - **sfall opcodes 0x8180–0x8182:** `get_critter_skill` (0x8180 → critter.getSkill()), `set_critter_skill_points` (0x8181 → sets base skill), `get_light_level` (0x8182 → globalState.ambientLightLevel)
  - **Checklist updated:** 6 new entries added (all implemented)
  - **40 new regression tests** in `phase21.test.ts`
- [ ] Scripting VM — complete remaining Fallout 2 procedure stubs *(critical path)*
- [ ] Dialogue + barter edge-case fidelity *(critical path)*
- [ ] Save/load reliability hardening and long-campaign round-trip fixtures
- [ ] Full in-browser map/script authoring tools *(long-term)*

---

### 🗺️ Phase 5 — Optional QoL Upgrades *(planned, post-1.0)*

*Goal: Layer optional modern conveniences on top of the complete, faithful vanilla experience. All features in this phase are toggleable and never alter base gameplay.*

- [ ] Widescreen and arbitrary-resolution rendering
- [ ] Scalable / high-DPI UI option
- [ ] Extended sfall-style scripting hooks for mod authors
- [ ] Optional UI improvements (e.g. better font legibility, larger inventory grid)
- [ ] In-browser mod manager with conflict detection
- [ ] Community-contributed QoL patches (e.g. Restoration Project compatibility)
- [ ] Full in-browser map and script authoring suite

---

## Near-Term Priorities

1. **Scripting VM — close procedure stubs** — this is the single highest-leverage item for game completability
2. **Rendering polish** — ✅ Fixed animation first-frame timing (`singleAnimation`/`staticAnimation`)
3. **Scripting coverage** — ✅ Added `reg_anim_obj_move_to_tile`, `get_year`, `obj_get_rot`, `set_obj_rot` to `vm_bridge.ts`
4. **Performance** — ✅ `SpriteBatch` batching (`src/renderBatch.ts`), `AssetCache` LRU cache (`src/assetStore.ts`)
5. **Debug/authoring tools** — ✅ MapViewerPanel (F5), ScriptDebuggerPanel (F6), PrototypeInspectorPanel (F7)
6. **Scripting VM milestone** — ✅ `obj_art_fid`, `art_anim`, sfall globals, `metarule(56, 0)` version, sfall opcodes 0x8157–0x8158, `critter_add_trait` trait side-effects
7. **Scripting VM continued** — ✅ `get_poison`/`get_radiation` critter status getters, integer-indexed sfall globals (0x815A–0x815B), `get_day_of_week` opcode (0x815C)
8. **VM opcode completeness** — ✅ `op_bwxor` (0x8042) / `op_bwnot` (0x8043) added; `play_sfx`, `reg_anim_obj_move_to_tile`, `animate_stand_obj` de-stubbed; sfall opcodes 0x815D–0x815E added
9. **Procedure de-stubbing & sfall expansion** — ✅ `set_light_level`, `obj_set_light_level`, `game_ui_disable`/`game_ui_enable` de-stubbed; sfall opcodes 0x815F–0x8162 (`get_pc_base_stat`, `set_pc_base_stat`, `set_critter_current_ap`, `get_npc_level`) added
10. **sfall critter/PC helpers & VM debug** — ✅ `get_critter_current_ap` (0x8163), `get_critter_max_hp` (0x8164), `get_pc_level` (0x8165) added; `critter_attempt_placement` de-stubbed; `ScriptVM.stepCount`/`currentProcedureName` debug fields added; `ScriptDebuggerPanel` shows step count and active procedure
11. **Performance instrumentation (Safe Impact Roadmap step 1)** — ✅ Decode-latency + eviction-reason telemetry added to `AssetCache`; `SpriteBatch` gains `frameTimeMs`; `ScriptVM` gains `lastCallTimeMs`/`totalCallTimeMs`; `GameMap` gains `PathfindingTelemetry` on `recalcPath`
12. **Save reliability + proto_data + sfall 0x8170–0x8174** — ✅ Save schema v5: GVAR_* script globals now persist across save/load (`scriptGlobalVars`); `proto_data` de-stubbed for common data members (item weight/cost/size, weapon stats, critter flags); `gfade_in/out` and `play_gmovie` no longer flood console; `get_critter_kills`, `set_critter_kills`, `get_critter_body_type`, `floor2`, `obj_count_by_pid` (0x8170–0x8174) added
13. **Phase 17 — Scripting completeness & save reliability** — ✅ `statMap` extended to all 34 stat constants; `gsay_end`/`end_dialogue` de-stubbed; `anim` stub noise eliminated; `set_exit_grids`, `tile_contains_pid_obj`, `wm_area_set_pos`, `mark_area_known(MARK_TYPE_MAP)` de-stubbed; `has_trait`/`critter_add_trait` OBJECT_CUR_WEIGHT (669) implemented; save schema v6: `gameTickTime` and `critterKillCounts` now persist across save/load
14. **Phase 19 — Scripting fidelity: ammo/weapon state, anim de-stub, proto_data extensions** — ✅ `anim()` silent for ANIM_* codes 0–99; `get_pc_stat(5)` returns 5; `inven_cmds` FIRST/LAST/PREV/NEXT navigation; `proto_data` extended (animCode, attack modes, projPID, minST, armor AC/DR, burst rounds); sfall opcodes 0x8178–0x817C (ammo PID/count getters/setters + mouse tile); 37 new regression tests
15. **Phase 20 — Scripting fidelity: metarule completeness, has_trait extensions, sfall 0x817D–0x817F** — ✅ `metarule` IDs 30/35/44/47/55 de-stubbed; `metarule3` IDs 101 (bounded random) and 107 (tile visible) de-stubbed; `has_trait` TRAIT_OBJECT cases 1/2/3/667/668 added; `critter_add_trait` TRAIT_OBJECT cases 667/668 added; sfall opcodes 0x817D–0x817F (`get_critter_name`, `get_game_mode`, `set_global_script_repeat`); 51 new regression tests
16. **Phase 21 — Scripting fidelity: inventory count, armor DR, obj_item_subtype, sfall 0x8180–0x8182** — ✅ `critter_inven_obj` INVEN_TYPE_INV_COUNT (-2) de-stubbed (returns inventory length); `proto_data` armor DR cases 34–39 added (Laser/Fire/Plasma/Electrical/EMP/Explosive, case 34 disambiguated by subType); `obj_item_subtype` silent 0-fallback (no stub noise); sfall opcodes 0x8180–0x8182 (`get_critter_skill`, `set_critter_skill_points`, `get_light_level`); 40 new regression tests

---

## Safe Impact Roadmap (Performance + High/Medium ROI Fixes)

This backlog focuses on changes that are **safe to ship incrementally**: low behavioral risk, easy to review, and straightforward to verify with existing tests and profiling.

### Safety guardrails

- Land work in small PRs (one subsystem at a time).
- Keep behavior-preserving refactors separate from functional changes.
- Require before/after metrics for performance items (frame time, draw calls, memory, load time).
- Add regression tests for bug fixes in combat, scripting, save/load, and pathfinding.

### High-impact safe fixes (P0/P1)

1. **Renderer hot-path profiling and micro-optimizations** *(P0, high)*  
   - ✅ `SpriteBatch.BatchStats` now includes `frameTimeMs` (CPU frame-assembly cost).  
   - Audit per-frame allocations in `renderer.ts`, `webglrenderer.ts`, and `renderBatch.ts`.  
   - Reuse temporary vectors/arrays and avoid object churn inside render loops.  
   - Cache repeated state lookups during frame assembly.  
   - **Exit criteria:** measurable frame-time reduction on dense maps with no visual regressions.

2. **Asset I/O and decode pipeline tuning** *(P0, high)*  
   - ✅ `AssetCache` telemetry extended: `recordDecodeLatency`/`avgDecodeLatencyMs` for decode latency, `lastEvictionReason` (`'capacity'` | `'explicit'`) for eviction reason.  
   - Prioritize prefetch of near-camera assets and common UI atlases.  
   - Move expensive decode steps off critical interaction paths where possible.  
   - **Exit criteria:** reduced hitching during movement/zone transitions.

3. **Pathfinding performance budget controls** *(P1, high)*  
   - ✅ `GameMap.pathfindingTelemetry` (`PathfindingTelemetry`) tracks `totalCalls`, `totalTimeMs`, `worstCaseTimeMs`, and `lastSolveTimeMs` — updated on every `recalcPath` call.  
   - Introduce bounded work per tick for expensive searches.  
   - Cache short-lived path results for repeated move intents in the same local area.  
   - **Exit criteria:** fewer long frame spikes during multi-actor movement.

4. **Script VM execution safeguards** *(P1, high)*  
   - ✅ `ScriptVM.call()` now tracks `lastCallTimeMs` and `totalCallTimeMs` for top-level procedure invocations.  
   - ✅ Added warn-level slow-script telemetry: `ScriptVM` now tracks `slowCallCount`/`lastSlowCallTimeMs` and logs calls that exceed `Config.engine.vmSlowCallWarnThresholdMs`.  
   - Ensure opcode helpers avoid repeated expensive lookups within tight loops.  
   - Expand opcode regression tests alongside each de-stubbed procedure/opcode.  
   - **Exit criteria:** lower VM-related frame variance and no behavior regressions in script tests.

5. **Save/load reliability hardening** *(P1, high)*  
   - ✅ Save schema v5: `scriptGlobalVars` field persists all Fallout 2 GVAR_* script globals across sessions; v4→v5 migration added; `Scripting.setGlobalVars()` export added; save and load paths in `saveload.ts` updated.  
   - Add corruption-tolerant guards and clearer migration diagnostics in save schema handling.  
   - Add round-trip fixtures for long-campaign state (quests, reputations, inventories, world map).  
   - **Exit criteria:** deterministic round-trip test pass and migration confidence across versions.

### Medium-impact safe fixes (P2)

1. **UI2 incremental render invalidation** *(medium)*  
   - Re-render only dirty panels/regions when static UI state has not changed.  
   - Avoid redundant texture/state binding for unchanged widgets.

2. **Audio scheduling and cache polish** *(medium)*  
   - Add simple voice/SFX de-duplication windows to reduce burst spam.  
   - Track decode/play latency metrics for common effects.

3. **Event bus backpressure visibility** *(medium)*  
   - Add queue depth counters and slow-handler logging hooks.  
   - Surface metrics in debug tooling for real-time diagnosis.

4. **Data loading parse cost reductions** *(medium)*  
   - Memoize repeat parse transforms for static LUT/data resources.  
   - Defer non-critical parsing until first use.

5. **Test-suite impact amplification** *(medium)*  
   - Add focused regression tests for recently completed opcode families and combat edge cases.  
   - Add perf smoke checks (non-gating) for render/pathfinding/script loops in CI reporting.

### Suggested rollout order (safe sequencing)

1. ✅ Instrumentation first (profiling + telemetry), no behavior changes.
2. Renderer + asset pipeline micro-optimizations.
3. Pathfinding and VM budget controls.
4. Save/load hardening and additional round-trip fixtures.
5. UI/audio/event-bus medium-impact polish items.

### Definition of done for each item

- Before/after numbers captured and attached to PR.
- No new failing tests in `vitest` suites.
- At least one regression test added for each non-trivial bug fix.
- Debug overlay/tooling updated when new telemetry is introduced.


## Success Criteria (1.0)

OpenF2 will be considered **1.0 ready** when:

- [ ] Fallout 2 is completable start-to-finish without major blockers
- [ ] Every major location, quest, and NPC in Fallout 2 functions correctly in-browser
- [ ] Save/load is reliable across long campaigns
- [ ] Core combat, skills, and progression match expected Fallout 2 behavior
- [x] All primary UI panels render through the `ui2` WebGL path (no DOM fallback for gameplay panels)
- [ ] UI and tooling are stable enough for community mod work

After 1.0, Phase 5 optional QoL improvements begin.
