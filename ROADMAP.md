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
| **Next milestone** | Rendering polish, scripting coverage, and authoring tools |

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

### Remaining gaps

- **Animation and rendering:** edge-case timing and fidelity polish still needed
- **Scripting VM:** partial opcode coverage; some Fallout 2 procedures not yet bridged
- **Authoring tools:** map editor, script debugger, and prototype inspector are future work

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
- [ ] Rendering edge-case parity and animation timing polish
- [ ] Performance: batching, asset streaming, WebGL caching
- [ ] Full in-browser map/script authoring tools *(long-term)*

---

## Near-Term Priorities

1. **Rendering polish** — Fix edge-case animation timing and visual fidelity gaps
2. **Scripting coverage** — Expand opcode and procedure support in `vm_bridge.ts`
3. **Performance** — Rendering batch optimization, asset streaming, WebGL caching
4. **Debug/authoring tools** — Map viewer, script debugger, prototype inspector (builds on DebugOverlayPanel)

---

## Success Criteria (1.0)

OpenF2 will be considered **1.0 ready** when:

- [ ] Fallout 2 is completable start-to-finish without major blockers
- [ ] Save/load is reliable across long campaigns
- [ ] Core combat, skills, and progression match expected Fallout 2 behavior
- [x] All primary UI panels render through the `ui2` WebGL path (no DOM fallback for gameplay panels)
- [ ] UI and tooling are stable enough for community mod work
