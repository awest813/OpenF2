# OpenF2 Roadmap

A staged plan for moving OpenF2 from a playable reimplementation to high-fidelity, moddable Fallout runtime support.

## Vision

OpenF2 aims to deliver:

- Gameplay-faithful behavior for classic Fallout titles
- Browser-native portability (with optional native wrappers)
- Strong modding and tooling support
- Maintainable architecture for long-term evolution

## Current execution status

- **Active phase:** Phase 4 — Fidelity, Modding, and Tooling
- **Phase state:** Phases 0–3 complete; Phase 4 in progress
- **Recent:** DAT override stacking and geometry correctness improvements landed

## Baseline (today)

### Working now

- Map loading and traversal
- Basic actor movement and pathing
- Dialogue + barter foundations
- Partial scripting VM support
- WebGL renderer with lighting support
- SPECIAL stats + full derived stats pipeline
- Skills system with checks and progression
- Traits and perks with prerequisite enforcement
- Combat damage formula (armor DT/DR, ammo, criticals, AP rules)
- Inventory and equipment management
- Character leveling and XP flow
- Quest tracking and reputation/karma
- Versioned save/load with schema migration

### Major gaps

- UI parity not reached (DOM/WebGL split — OptionsPanel, SaveLoadPanel, font debug now migrated to ui2)
- World map placement/travel issues
- Animation timing and edge-case rendering parity still incomplete
- In-browser debugging and authoring tools still minimal

---

## Phase 0 — Stabilize Core Architecture

**Goal:** Make core systems reliable enough for rapid feature development.

- [x] Centralized engine lifecycle/state boundaries
- [x] Hardened event/message plumbing between subsystems
- [x] Typed ECS coverage for actors/items/scripts
- [x] Versioned save schema + migration strategy
- [x] Expanded regression tests for scripting and combat primitives

## Phase 1 — Playable Core RPG Loop

**Goal:** Deliver a stable "start-to-first-hub" experience in Fallout 2 content.

- [x] Complete SPECIAL + derived stats pipeline
- [x] Implement all skills with checks and progression hooks
- [x] Implement traits/perks with prerequisite enforcement
- [x] Expand combat correctness: armor, ammo, ranges, AP rules
- [x] Improve inventory/equipment behavior and constraints
- [x] Reliable leveling flow and character screen interactions

## Phase 2 — Full Fallout 2 Completion

**Goal:** Make Fallout 2 completable end-to-end.

- [x] World map correctness and travel balancing
- [x] Broader opcode/procedure coverage in scripting runtime
- [x] Quest tracking and reputation/karma consistency
- [ ] UI migration toward full bitmap-faithful rendering (in progress; ui2/ module scaffolded, OptionsPanel/SaveLoadPanel/BitmapFontRenderer wired)
- [x] Audio completeness baseline: effects, music logic, format handling
- [x] Ending/intro/cinematic pipeline baseline (scaffold)

## Phase 3 — Fallout 1 Compatibility

**Goal:** Add engine/version support to run Fallout 1 data and flow.

- [x] DAT1/MAP/PRO format compatibility layer (`src/compat/fallout1.ts`)
- [x] Fallout 1 world-map grid configuration (`worldGridConfig`)
- [x] F1 encounter rate table (`encounterRateForFrequency`)
- [x] Script/procedure compat table — F2-only procs documented; no divergent name mappings needed for currently integrated F1 content
- [x] F1 intro/ending cinematic sequence factories (`buildF1CinematicSequence`)

## Phase 4 — Fidelity, Modding, and Tooling

**Goal:** Improve correctness, performance, and contributor ecosystem.

- [x] DAT override stacking + structured mod manifests (`src/mods.ts`, `ModRegistry`)
- [x] Pathfinding and line-of-sight correctness improvements (`hexLine` cube-lerp, `hexesInRadius` ring algorithm)
- [ ] Rendering edge-case parity and animation timing polish
- [ ] In-browser editing/debugging tools (long-term)
- [ ] Performance work: batching, streaming, caching

---

## Near-term priorities

1. UI migration away from mixed DOM rendering (OptionsPanel, SaveLoadPanel, BitmapFontRenderer in ui2 — remaining: dialogue, barter, loot, inventory, world map, elevator, called shot)
2. World map travel and entrance alignment fixes
3. Rendering edge-case parity and animation timing polish
4. In-browser debugging and content tooling foundation
5. Performance work: batching, streaming, and caching

## Success criteria

OpenF2 will be considered "1.0 ready" when:

- Fallout 2 is completable without major blockers
- Save/load survives long campaigns reliably
- Core combat, skills, and progression match expected behavior
- UI and tooling are stable enough for community mod work
