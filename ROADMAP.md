# OpenF2 Roadmap

A staged plan for bringing OpenF2 from an experimental Fallout 2 engine reimplementation to full Fallout 1 + Fallout 2 compatibility.

## Vision

OpenF2 aims to deliver:

- Gameplay-faithful behavior for classic Fallout titles
- Browser-native portability (with optional native wrappers)
- Strong modding and tooling support
- Maintainable architecture for long-term evolution

## Current execution status

- **Active phase:** Phase 0 — Stabilize Core Architecture
- **Phase state:** Started

## Baseline (today)

### Working now

- Map loading and traversal
- Basic actor movement and pathing
- Dialogue + barter foundations
- Partial scripting VM support
- WebGL renderer with lighting support
- Early save/load support

### Major gaps

- Incomplete combat systems (armor/ammo/depth)
- Incomplete character progression (skills/perks/traits)
- UI parity not reached (DOM/WebGL split)
- World map placement/travel issues
- Incomplete audio feature set
- Missing Fallout 1 compatibility layer

---

## Phase 0 — Stabilize Core Architecture

**Goal:** Make core systems reliable enough for rapid feature development.

- [ ] Centralized engine lifecycle/state boundaries
- [ ] Hardened event/message plumbing between subsystems
- [ ] Typed ECS coverage for actors/items/scripts
- [ ] Versioned save schema + migration strategy
- [ ] Expanded regression tests for scripting and combat primitives

## Phase 1 — Playable Core RPG Loop

**Goal:** Deliver a stable "start-to-first-hub" experience in Fallout 2 content.

- [ ] Complete SPECIAL + derived stats pipeline
- [ ] Implement all skills with checks and progression hooks
- [ ] Implement traits/perks with prerequisite enforcement
- [ ] Expand combat correctness: armor, ammo, ranges, AP rules
- [ ] Improve inventory/equipment behavior and constraints
- [ ] Reliable leveling flow and character screen interactions

## Phase 2 — Full Fallout 2 Completion

**Goal:** Make Fallout 2 completable end-to-end.

- [ ] World map correctness and travel balancing
- [ ] Broader opcode/procedure coverage in scripting runtime
- [ ] Quest tracking and reputation/karma consistency
- [ ] UI migration toward full bitmap-faithful rendering
- [ ] Audio completeness: effects, music logic, format handling
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

1. Combat correctness (armor/ammo/AP/critical effects)
2. UI migration away from mixed DOM rendering
3. Save/load reliability and schema versioning
4. Script runtime coverage + regression test expansion
5. World map travel and entrance alignment fixes

## Success criteria

OpenF2 will be considered "1.0 ready" when:

- Fallout 2 is completable without major blockers
- Save/load survives long campaigns reliably
- Core combat, skills, and progression match expected behavior
- UI and scripting are stable enough for community mod work
