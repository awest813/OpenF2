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
- Large crash-hardening + sfall opcode surface is in place; checklist marks 807 entries implemented
  (many are safe no-ops — see parity audit).
- **Campaign completion is NOT READY.** Prior region `CERTIFIED` / gate `READY` claims were
  scaffold-based and have been reset. See `docs/F2_FULL_PARITY_PLAN.md` and
  `docs/F2_PARITY_ISSUES.md`.
- Measured suite @ latest audit: **5103 passed / 61 failed** (asset-absent script corpora +
  `get_tile_fid`); `tsc --noEmit` clean.

### System Status Dashboard

| Area | Status | Notes |
|---|---|---|
| Engine lifecycle | Working | `src/engine.ts` module lifecycle state machine |
| Asset loading | Working | `src/assetStore.ts`, `src/mods.ts`; repo ships almost no converted game data |
| Map loading/traversal | Working | `src/map.ts` + scaffold/world tests |
| Entity system | Adapter in progress | Critter → ECS projection for HUD/sheet (P0-2); dual write paths remain |
| Rendering | Working (WebGL) | `src/renderer.ts`, `src/webglrenderer.ts` |
| UI panels | Dual stacks | `src/ui2/*` + legacy `src/ui.ts` (P1-10) |
| Audio | Partial | SFX/music path exists; speech/movies missing (P1-9) |
| Save/load | Working (hardened) | `src/saveload.ts`, schema v23 |
| Combat | Working, AI shallow | Uses 2 of ~20 AI.TXT fields (P1-1) |
| Scripting VM/bridge | Broad surface, fidelity uneven | Safe stubs often marked implemented (P3-2) |
| New game / chargen | In progress (Slice C) | Main menu + chargen UI; `?map` still skips for dev (P0-1) |
| Skilldex | In progress (Slice D) | All 8 Skilldex skills selectable; Steal inventory UI / trap damage polish remain (P0-3) |
| Dialogue/barter | Working core | Edge fidelity + reaction model remain |
| Ending / endgame slides | Missing | No ENDGAME.TXT selection (P1-8) |
| Multiplayer | Missing (experimental) | Not part of core path |

---

## Critical Path to Full Fallout 2 Playability

Plan of record: **`docs/F2_FULL_PARITY_PLAN.md`**. Issue inventory: **`docs/F2_PARITY_ISSUES.md`**.

Highest-leverage remaining work (Tier 0 first):

1. **Honest measurement** — asset tests skip when absent; checklist distinguishes safe stubs;
   certification uses real maps/scripts only.
2. **Unify character model** — one source of truth for HUD, combat, scripts, perks, weight (P0-2).
3. **New game + character creation** — main menu → SPECIAL/tags/traits → Temple (P0-1).
4. **Complete Skilldex** — Sneak, Steal, Traps, First Aid, Doctor, Science (P0-3).
5. **Real-asset campaign validation** — Arroyo→Oil Rig against converted install (P0-4/P0-5).
6. **Tier 1 systems** — perks/traits, drugs/rad/poison, party, rest/holodisks, rep, AI, car, endings.

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

Tracked as workstreams WS0–WS6 in `docs/F2_FULL_PARITY_PLAN.md`:

- WS0 honest measurement + certification reset
- WS1 single character model
- WS2 new game / chargen
- WS3 Skilldex completion
- WS4 real-asset script certification
- WS5 Tier 1 campaign systems (party, drugs, rep, car, endings, …)
- WS6 fidelity polish (LOS, fades, combat table audit, …)

## Phase E — Browser Delivery and Performance

- Harden browser packaging and deployment workflows
- Improve runtime performance profiling and optimization
- Expand compatibility coverage across modern browsers

## Phase F — Optional Future Features

- WebGPU rendering backend prototype
- Multiplayer/netplay research experiments
- Expanded modding and authoring workflows

---

## Near-term execution slices

Prefer small PRs; leave the suite green on a clean (asset-less) checkout.

| Slice | Focus |
|---|---|
| A | Docs honesty (this work) + asset tests skip + checklist status vocabulary |
| B | Unify character model; HUD HP follows combat damage |
| C | Main menu + chargen + New Game → `artemple` |
| D | Remaining Skilldex skills |
| E | Fix `get_tile_fid`; Arroyo real-script smoke (opt-in assets) | Done — see `docs/F2_REAL_ASSET_LANE.md` |
| F | Perks/traits + drugs + rad/poison (core) | Done — timed save/load still open |
| G | Rest + holodisk archives + party control (P1-11 / P1-3 core) | Done — trade UI / automap / combat AI hooks still open |
| H+ | Rep / AI / car per full parity plan |

### Longer horizon

- Region-by-region real-asset re-certification through Oil Rig
- Ending slides + credits; UI stack consolidation
- Browser-first playable release with strong fidelity guarantees

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
- Browser-hosted shared world-state experimentation (for example: synchronizing travel/location state between multiple connected clients in a prototype session)

They should not delay the core objective of complete Fallout 2 single-player fidelity.

---

## How Contributors Can Help

Highest-value contribution areas (see `docs/F2_FULL_PARITY_PLAN.md`):

1. Character-model unification (`globalState.player` vs ECS) — P0-2
2. New game / character creation UI and handoff — P0-1
3. Skilldex skills beyond Lockpick/Repair — P0-3
4. Asset-absent test skipping + real-asset opt-in lane — P0-4
5. Tier 1 systems: perks/traits, party, drugs/rad/poison, rest, endings

When in doubt, pick open Tier 0 items in `docs/F2_PARITY_ISSUES.md`.
