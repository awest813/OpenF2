# OpenF2 Roadmap

OpenF2 is an open-source engine reimplementation focused on fully playable Fallout 2 fidelity first, then optional modern platform features.

## Guiding Principles

1. **Fidelity first** — match original Fallout 2 game behavior.
2. **Playability over polish** — complete end-to-end progression before optional upgrades.
3. **Transparent progress** — tie roadmap items to concrete subsystems and tests.
4. **Browser-native portability** — keep modern web support as a first-class deployment target.

---

## Current Project Status

- Core engine runtime is functioning (map loading, rendering, input, combat loop, UI panels, save/load).
- Test suite is active and extensive (`npm test` currently reports 1817 passing tests).
- Largest remaining risk to complete playability is **scripting/runtime parity** and edge-case fidelity.

### System Status Dashboard

| Area | Status | Notes |
|---|---|---|
| Engine lifecycle | Working | `src/engine.ts` module lifecycle state machine |
| Asset loading | Working | `src/assetStore.ts`, `src/mods.ts` |
| Map loading/traversal | Working | `src/map.ts` + campaign/world tests |
| Entity system | Working | `src/ecs/*` |
| Rendering | Working (WebGL) | `src/renderer.ts`, `src/webglrenderer.ts` |
| UI panels | Working, still refining parity | `src/ui2/*`, panel parity tests |
| Audio | Working | `src/audio.ts` |
| Save/load | Working (ongoing hardening) | `src/saveload.ts`, schema migrations |
| Combat | Working, AI fidelity partial | `src/combat.ts`, damage and integration tests |
| Scripting VM/bridge | Partial | `src/scripting.ts`, checklist-driven parity work |
| Dialogue/barter edge behavior | Partial | Core loop works; edge-case parity remains |
| Quest scripting completeness | Partial | Quest infrastructure exists; script parity ongoing |
| Multiplayer | Missing (experimental) | Not part of core path |

---

## Critical Path to Full Fallout 2 Playability

These items are required for dependable start-to-end playthroughs:

1. **Complete high-impact script parity**
   - Continue converting `partial` entries in `src/scriptingChecklist.ts` to implemented behavior.
2. **Dialogue + barter edge-case completion**
   - Close remaining conversation branching and barter scripting gaps.
3. **Animation/script callback fidelity**
   - Improve `reg_anim_*` and related sequencing behavior used by campaign scripts.
4. **Campaign progression validation**
   - Verify major hubs and transitions with real asset playthrough checks.
5. **Long-session save/load reliability**
   - Multi-map and quest-heavy round-trip validation.
6. **Combat AI parity improvements**
   - Better tactical behavior matching original AI expectations.

---

## Milestone Plan

## Phase A — Engine Boot (Completed Foundation)

- Engine lifecycle and module orchestration
- Asset loading pipeline and converted data usage
- Baseline rendering and map load flow

## Phase B — Core Gameplay Systems (Mostly Complete)

- Character stats, skills, perks, traits
- Inventory/equipment and progression systems
- Quest/reputation scaffolding

## Phase C — Combat + World Systems (Mostly Complete)

- Turn-based combat pipeline and damage formulas
- World map and random encounters
- UI2 gameplay panel migration

## Phase D — Full Playability Push (Current Focus)

- Scripting procedure/opcode parity completion
- Dialogue/barter fidelity edge cases
- Campaign-scale progression + save/load confidence

## Phase E — Browser Delivery and Performance

- Harden browser packaging and deployment workflows
- Improve runtime performance profiling and optimization
- Expand compatibility coverage across modern browsers

## Phase F — Optional Future Features

- WebGPU rendering backend prototype
- Multiplayer/netplay research experiments
- Expanded modding and authoring workflows

---

## Time Horizon Breakdown

### Short Term (Now → next major milestone)

- Resolve high-impact scripting partials
- Improve dialogue/barter fidelity in common progression paths
- Expand regression coverage for scripting + save/load edge cases

### Medium Term

- Validate early-to-mid campaign continuity (Arroyo through early hubs)
- Improve AI behavior fidelity and encounter consistency
- Stabilize browser runtime behavior across platforms

### Long Term Vision

- End-to-end Fallout 2 completion with strong fidelity guarantees
- Browser-first playable release
- Modding-quality engine tooling and optional rendering backends

---

## Browser Support Plan

OpenF2 is well-positioned for browser play:

- **WebAssembly:** for packaging performance-sensitive runtime pieces where applicable
- **WebGL (current):** production rendering path
- **WebGPU (future optional):** higher-performance renderer path under a backend abstraction
- **Emscripten/toolchain integration:** where native interop workflows are beneficial

Goals:

- Playable in modern desktop browsers
- Progressive support improvements for constrained/mobile devices
- Foundation for cloud-synced or shared-session experiments

---

## Experimental Track (Not Core Scope)

These are intentionally out-of-critical-path experiments:

- Co-op / netplay prototypes
- Multiplayer state synchronization experiments
- Browser-hosted shared world-state experimentation

They should not delay the core objective of complete Fallout 2 single-player fidelity.

---

## How Contributors Can Help

Highest-value contribution areas:

1. `src/scripting.ts` + `src/scriptingChecklist.ts`
2. Script/VM regression tests (`src/phase*.test.ts`, `src/vm.test.ts`)
3. Dialogue/barter edge-case implementation and test coverage
4. Save/load campaign fidelity validation
5. Combat AI behavior parity improvements

When in doubt, pick items that remove remaining partial scripting/runtime behavior on the critical path.
