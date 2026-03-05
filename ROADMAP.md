# OpenF2 Roadmap

A staged plan for moving OpenF2 from a playable reimplementation to a high-fidelity, moddable Fallout runtime.

---

## Vision

OpenF2 aims to deliver:

- **Gameplay-faithful behavior** for classic Fallout 1 and Fallout 2
- **Browser-native portability** (with optional native wrappers)
- **Strong modding and tooling support** for the community
- **Maintainable architecture** that can evolve over the long term

---

## Current Status

| Item | Detail |
|------|--------|
| **Active phase** | Phase 4 — Fidelity, Modding, and Tooling |
| **Completed phases** | 0 · 1 · 2 · 3 |
| **Next milestone** | Scripting VM (Fallout 2 procedure stubs, sfall extended opcodes) |

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

### Remaining gaps

- **Scripting VM:** some Fallout 2 procedures remain stubs; broader sfall opcode coverage is ongoing
- **Authoring tools:** full map editor, script step-debugger are future work

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

### ✅ Phase 2 — Full Fallout 2 Completion

*Goal: Make Fallout 2 completable end-to-end.*

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

*Goal: Improve correctness, performance, and the contributor ecosystem.*

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
- [ ] Full in-browser map/script authoring tools *(long-term)*

---

## Near-Term Priorities

1. **Rendering polish** — ✅ Fixed animation first-frame timing (`singleAnimation`/`staticAnimation`)
2. **Scripting coverage** — ✅ Added `reg_anim_obj_move_to_tile`, `get_year`, `obj_get_rot`, `set_obj_rot` to `vm_bridge.ts`
3. **Performance** — ✅ `SpriteBatch` batching (`src/renderBatch.ts`), `AssetCache` LRU cache (`src/assetStore.ts`)
4. **Debug/authoring tools** — ✅ MapViewerPanel (F5), ScriptDebuggerPanel (F6), PrototypeInspectorPanel (F7)
5. **Scripting VM milestone** — ✅ `obj_art_fid`, `art_anim`, sfall globals, `metarule(56, 0)` version, sfall opcodes 0x8157–0x8158, `critter_add_trait` trait side-effects
6. **Scripting VM continued** — ✅ `get_poison`/`get_radiation` critter status getters, integer-indexed sfall globals (0x815A–0x815B), `get_day_of_week` opcode (0x815C)
7. **VM opcode completeness** — ✅ `op_bwxor` (0x8042) / `op_bwnot` (0x8043) added; `play_sfx`, `reg_anim_obj_move_to_tile`, `animate_stand_obj` de-stubbed; sfall opcodes 0x815D–0x815E added
8. **Procedure de-stubbing & sfall expansion** — ✅ `set_light_level`, `obj_set_light_level`, `game_ui_disable`/`game_ui_enable` de-stubbed; sfall opcodes 0x815F–0x8162 (`get_pc_base_stat`, `set_pc_base_stat`, `set_critter_current_ap`, `get_npc_level`) added
9. **sfall critter/PC helpers & VM debug** — ✅ `get_critter_current_ap` (0x8163), `get_critter_max_hp` (0x8164), `get_pc_level` (0x8165) added; `critter_attempt_placement` de-stubbed; `ScriptVM.stepCount`/`currentProcedureName` debug fields added; `ScriptDebuggerPanel` shows step count and active procedure

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
   - Audit per-frame allocations in `renderer.ts`, `webglrenderer.ts`, and `renderBatch.ts`.  
   - Reuse temporary vectors/arrays and avoid object churn inside render loops.  
   - Cache repeated state lookups during frame assembly.  
   - **Exit criteria:** measurable frame-time reduction on dense maps with no visual regressions.

2. **Asset I/O and decode pipeline tuning** *(P0, high)*  
   - Extend `AssetCache` telemetry (hit/miss, eviction reason, decode latency).  
   - Prioritize prefetch of near-camera assets and common UI atlases.  
   - Move expensive decode steps off critical interaction paths where possible.  
   - **Exit criteria:** reduced hitching during movement/zone transitions.

3. **Pathfinding performance budget controls** *(P1, high)*  
   - Introduce bounded work per tick for expensive searches.  
   - Cache short-lived path results for repeated move intents in the same local area.  
   - Add lightweight instrumentation to track worst-case path solve times.  
   - **Exit criteria:** fewer long frame spikes during multi-actor movement.

4. **Script VM execution safeguards** *(P1, high)*  
   - Add per-script execution counters and warn-level telemetry for pathological scripts.  
   - Ensure opcode helpers avoid repeated expensive lookups within tight loops.  
   - Expand opcode regression tests alongside each de-stubbed procedure/opcode.  
   - **Exit criteria:** lower VM-related frame variance and no behavior regressions in script tests.

5. **Save/load reliability hardening** *(P1, high)*  
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

1. Instrumentation first (profiling + telemetry), no behavior changes.
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
- [ ] Save/load is reliable across long campaigns
- [ ] Core combat, skills, and progression match expected Fallout 2 behavior
- [x] All primary UI panels render through the `ui2` WebGL path (no DOM fallback for gameplay panels)
- [ ] UI and tooling are stable enough for community mod work
