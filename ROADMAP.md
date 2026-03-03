# OpenF2 Roadmap

A staged plan for bringing OpenF2 from an experimental Fallout 2 engine reimplementation to full Fallout 1 + Fallout 2 compatibility.

## Vision

OpenF2 aims to deliver:

- Gameplay-faithful behavior for classic Fallout titles
- Browser-native portability (with optional native wrappers)
- Strong modding and tooling support
- Maintainable architecture for long-term evolution

## Current execution status

- **Active phase:** Phase 2 — Full Fallout 2 Completion
- **Phase state:** In progress

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

- UI parity not reached (DOM/WebGL split)
- World map placement/travel issues
- Incomplete audio feature set
- Ending/intro/cinematic pipeline not implemented
- Missing Fallout 1 compatibility layer

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

- [ ] World map correctness and travel balancing
- [x] Broader opcode/procedure coverage in scripting runtime
- [x] Quest tracking and reputation/karma consistency
- [ ] UI migration toward full bitmap-faithful rendering
- [x] Audio completeness: effects, music logic, format handling
- [ ] Ending/intro/cinematic pipeline support

## Phase 3 — Fallout 1 Compatibility

**Goal:** Add engine/version support to run Fallout 1 data and flow.

- [ ] DAT1/MAP/PRO format compatibility layer
- [ ] Fallout 1 specific world map and progression rules
- [ ] Script/procedure compatibility for Fallout 1 content
- [ ] Intro/ending presentation parity for Fallout 1 assets

## Phase 4 — Fidelity, Modding, and Tooling

**Goal:** Improve correctness, performance, and contributor ecosystem.

- [ ] Rendering edge-case parity and animation timing polish
- [ ] Pathfinding and line-of-sight correctness improvements
- [ ] DAT override stacking + structured mod manifests
- [ ] In-browser editing/debugging tools (long-term)
- [ ] Performance work: batching, streaming, caching

---

## Near-term priorities

1. UI migration away from mixed DOM rendering
2. World map travel and entrance alignment fixes
3. Script runtime opcode/procedure coverage expansion
4. Audio completeness (effects, music logic, format handling)
5. Ending/intro/cinematic pipeline support

## Success criteria

OpenF2 will be considered "1.0 ready" when:

- Fallout 2 is completable without major blockers
- Save/load survives long campaigns reliably
- Core combat, skills, and progression match expected behavior
- UI and scripting are stable enough for community mod work
