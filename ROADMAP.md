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
- [ ] Full UI migration to bitmap-faithful rendering *(complete — Phase 4)*

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
- [ ] Full in-browser map/script authoring tools *(long-term)*

---

## Near-Term Priorities

1. **Rendering polish** — ✅ Fixed animation first-frame timing (`singleAnimation`/`staticAnimation`)
2. **Scripting coverage** — ✅ Added `reg_anim_obj_move_to_tile`, `get_year`, `obj_get_rot`, `set_obj_rot` to `vm_bridge.ts`
3. **Performance** — ✅ `SpriteBatch` batching (`src/renderBatch.ts`), `AssetCache` LRU cache (`src/assetStore.ts`)
4. **Debug/authoring tools** — ✅ MapViewerPanel (F5), ScriptDebuggerPanel (F6), PrototypeInspectorPanel (F7)
5. **Scripting VM milestone** — ✅ `obj_art_fid`, `art_anim`, sfall globals, `metarule(56, 0)` version, sfall opcodes 0x8157–0x8158, `critter_add_trait` trait side-effects
6. **Scripting VM continued** — ✅ `get_poison`/`get_radiation` critter status getters, integer-indexed sfall globals (0x815A–0x815B), `get_day_of_week` opcode (0x815C)

---

## Success Criteria (1.0)

OpenF2 will be considered **1.0 ready** when:

- [ ] Fallout 2 is completable start-to-finish without major blockers
- [ ] Save/load is reliable across long campaigns
- [ ] Core combat, skills, and progression match expected Fallout 2 behavior
- [x] All primary UI panels render through the `ui2` WebGL path (no DOM fallback for gameplay panels)
- [ ] UI and tooling are stable enough for community mod work
